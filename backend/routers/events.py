from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from auth import get_current_user, require_role, get_current_user_optional

router = APIRouter()

class ResourceRequest(BaseModel):
    resource_id: int
    quantity: Optional[int] = 1

class EventCreate(BaseModel):
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    date: str
    time: str
    venue_id: Optional[int] = None
    capacity: int
    resource_ids: Optional[List[ResourceRequest]] = []

class EventUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    venue_id: Optional[int] = None
    capacity: Optional[int] = None
    status: Optional[str] = None

def with_counts(conn, event):
    event_dict = dict(event)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM registrations WHERE event_id = ? AND status = 'Confirmed'", (event_dict['id'],))
    confirmed = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM waitlist WHERE event_id = ? AND status = 'Waiting'", (event_dict['id'],))
    waitlisted = cursor.fetchone()[0]
    
    venue = None
    if event_dict.get('venue_id'):
        cursor.execute("SELECT * FROM venues WHERE id = ?", (event_dict['venue_id'],))
        venue_row = cursor.fetchone()
        if venue_row:
            venue = dict(venue_row)
            
    cursor.execute("""
        SELECT r.id, r.name, er.quantity FROM event_resources er
        JOIN resources r ON r.id = er.resource_id WHERE er.event_id = ?
    """, (event_dict['id'],))
    resources = [dict(r) for r in cursor.fetchall()]
    
    event_dict['venue'] = venue
    event_dict['resources'] = resources
    event_dict['confirmedCount'] = confirmed
    event_dict['waitlistCount'] = waitlisted
    event_dict['seatsRemaining'] = max(event_dict['capacity'] - confirmed, 0)
    
    return event_dict

def with_counts_batch(conn, events):
    """
    Same shape as with_counts(), but for a list of events — runs a fixed
    number of queries total instead of ~4 queries per event (N+1), using
    IN (...) lookups and grouping the results in Python.
    """
    events = [dict(e) for e in events]
    if not events:
        return []

    ids = [e['id'] for e in events]
    placeholders = ",".join("?" for _ in ids)
    cursor = conn.cursor()

    cursor.execute(
        f"SELECT event_id, COUNT(*) AS c FROM registrations WHERE event_id IN ({placeholders}) AND status = 'Confirmed' GROUP BY event_id",
        ids
    )
    confirmed_by_id = {row['event_id']: row['c'] for row in cursor.fetchall()}

    cursor.execute(
        f"SELECT event_id, COUNT(*) AS c FROM waitlist WHERE event_id IN ({placeholders}) AND status = 'Waiting' GROUP BY event_id",
        ids
    )
    waitlisted_by_id = {row['event_id']: row['c'] for row in cursor.fetchall()}

    venue_ids = list({e['venue_id'] for e in events if e.get('venue_id')})
    venues_by_id = {}
    if venue_ids:
        vp = ",".join("?" for _ in venue_ids)
        cursor.execute(f"SELECT * FROM venues WHERE id IN ({vp})", venue_ids)
        venues_by_id = {row['id']: dict(row) for row in cursor.fetchall()}

    cursor.execute(
        f"""SELECT er.event_id, r.id, r.name, er.quantity FROM event_resources er
            JOIN resources r ON r.id = er.resource_id WHERE er.event_id IN ({placeholders})""",
        ids
    )
    resources_by_event = {}
    for row in cursor.fetchall():
        resources_by_event.setdefault(row['event_id'], []).append(
            {"id": row['id'], "name": row['name'], "quantity": row['quantity']}
        )

    result = []
    for e in events:
        confirmed = confirmed_by_id.get(e['id'], 0)
        e['venue'] = venues_by_id.get(e.get('venue_id'))
        e['resources'] = resources_by_event.get(e['id'], [])
        e['confirmedCount'] = confirmed
        e['waitlistCount'] = waitlisted_by_id.get(e['id'], 0)
        e['seatsRemaining'] = max(e['capacity'] - confirmed, 0)
        result.append(e)

    return result

@router.get("")
def get_events(category: Optional[str] = None, q: Optional[str] = None):
    """Public/student-facing list — only events an admin has approved and
    that aren't cancelled ever show up here."""
    conn = get_db()
    cursor = conn.cursor()
    
    sql = "SELECT * FROM events WHERE status = 'Scheduled' OR status = 'Completed'"
    params = []
    
    if category:
        sql += " AND category = ?"
        params.append(category)
    if q:
        sql += " AND (name LIKE ? OR description LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%"])
        
    sql += " ORDER BY date ASC, time ASC"
    
    cursor.execute(sql, params)
    events = cursor.fetchall()
    
    result = with_counts_batch(conn, events)
    conn.close()
    return result

@router.get("/pending-approval")
def get_pending_events(user: dict = Depends(require_role(["administrator"]))):
    """Admin-only queue of organiser-submitted events awaiting a decision."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.*, u.name AS organiser_name, u.email AS organiser_email
        FROM events e JOIN users u ON u.id = e.organiser_id
        WHERE e.status = 'PendingApproval'
        ORDER BY e.created_at ASC
    """)
    events = cursor.fetchall()
    result = with_counts_batch(conn, events)
    conn.close()
    return result

@router.post("/{id}/approve")
def approve_event(id: int, user: dict = Depends(require_role(["administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
    if event["status"] != "PendingApproval":
        conn.close()
        raise HTTPException(status_code=400, detail=f"Event is already '{event['status']}', not pending approval.")

    cursor.execute("UPDATE events SET status = 'Scheduled' WHERE id = ?", (id,))
    cursor.execute(
        "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
        (event["organiser_id"], id, f"Your event \"{event['name']}\" was approved and is now live for students to register.", "Approval")
    )
    conn.commit()

    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    updated = cursor.fetchone()
    result = with_counts(conn, updated)
    conn.close()
    return result

class RejectRequest(BaseModel):
    reason: Optional[str] = None

@router.post("/{id}/reject")
def reject_event(id: int, body: RejectRequest, user: dict = Depends(require_role(["administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
    if event["status"] != "PendingApproval":
        conn.close()
        raise HTTPException(status_code=400, detail=f"Event is already '{event['status']}', not pending approval.")

    cursor.execute("UPDATE events SET status = 'Rejected' WHERE id = ?", (id,))
    reason_suffix = f" Reason: {body.reason}" if body.reason else ""
    cursor.execute(
        "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
        (event["organiser_id"], id, f"Your event \"{event['name']}\" was not approved.{reason_suffix}", "Rejection")
    )
    conn.commit()

    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    updated = cursor.fetchone()
    result = with_counts(conn, updated)
    conn.close()
    return result

@router.get("/mine/organised")
def get_my_events(user: dict = Depends(require_role(["organiser", "administrator"]))):
    """An organiser's own dashboard — shows ALL of their events regardless of
    approval status (PendingApproval, Scheduled, Rejected, Cancelled, Completed)
    so they can track where each submission stands."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE organiser_id = ? ORDER BY date DESC", (user['id'],))
    events = cursor.fetchall()
    result = with_counts_batch(conn, events)
    conn.close()
    return result

@router.get("/{id}")
def get_event(id: int, user: Optional[dict] = Depends(get_current_user_optional)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    event = cursor.fetchone()
    
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")

    # Events awaiting approval (or rejected) are only visible to the
    # organiser who submitted them and to administrators — not the public.
    if event["status"] in ("PendingApproval", "Rejected"):
        is_owner = user and (user.get("id") == event["organiser_id"])
        is_admin = user and (user.get("role") == "administrator")
        if not (is_owner or is_admin):
            conn.close()
            raise HTTPException(status_code=404, detail="Event not found.")
        
    result = with_counts(conn, event)
    conn.close()
    return result

@router.post("")
def create_event(event_data: EventCreate, user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    
    if event_data.venue_id:
        cursor.execute("""
            SELECT * FROM events WHERE venue_id = ? AND date = ? AND time = ? AND status IN ('Scheduled', 'PendingApproval')
        """, (event_data.venue_id, event_data.date, event_data.time))
        conflict = cursor.fetchone()
        if conflict:
            conn.close()
            raise HTTPException(status_code=409, detail=f"Venue conflict: \"{conflict['name']}\" is already scheduled at this venue on {event_data.date} at {event_data.time}.")

    # Administrators can publish directly; organisers' submissions go into the
    # approval queue and only become visible once an admin approves them.
    initial_status = "Scheduled" if user["role"] == "administrator" else "PendingApproval"

    cursor.execute("""
        INSERT INTO events (name, category, description, date, time, venue_id, capacity, organiser_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (event_data.name, event_data.category, event_data.description, event_data.date, event_data.time, event_data.venue_id, event_data.capacity, user['id'], initial_status))
    
    event_id = cursor.lastrowid
    
    for r in event_data.resource_ids:
        cursor.execute("INSERT INTO event_resources (event_id, resource_id, quantity) VALUES (?, ?, ?)", (event_id, r.resource_id, r.quantity or 1))

    if initial_status == "PendingApproval":
        cursor.execute("SELECT id FROM users WHERE role = 'administrator'")
        admins = cursor.fetchall()
        for a in admins:
            cursor.execute(
                "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
                (a["id"], event_id, f"New event \"{event_data.name}\" submitted by {user['name']} needs your approval.", "ApprovalRequest")
            )

    conn.commit()
    
    cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    new_event = cursor.fetchone()
    result = with_counts(conn, new_event)
    conn.close()
    return result

@router.put("/{id}")
def update_event(id: int, event_data: EventUpdate, user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
        
    if user['role'] == "organiser" and event['organiser_id'] != user['id']:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only edit events you organise.")

    # Organisers cannot self-approve/self-publish or un-reject their own event —
    # that decision belongs to an administrator via /approve and /reject.
    # The one status change an organiser IS allowed to make directly is
    # cancelling their own event.
    if event_data.status is not None and user['role'] == "organiser":
        if event_data.status not in ("Cancelled",):
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="Organisers cannot set this status directly. Cancel the event, or wait for an administrator to approve/reject it."
            )
        
    changed_schedule = False
    if event_data.date and event_data.date != event['date']: changed_schedule = True
    if event_data.time and event_data.time != event['time']: changed_schedule = True
    if event_data.venue_id and event_data.venue_id != event['venue_id']: changed_schedule = True
    
    v_id = event_data.venue_id if event_data.venue_id is not None else event['venue_id']
    v_date = event_data.date if event_data.date is not None else event['date']
    v_time = event_data.time if event_data.time is not None else event['time']
    
    if v_id and v_date and v_time:
        cursor.execute("""
            SELECT * FROM events WHERE venue_id = ? AND date = ? AND time = ? AND id != ? AND status IN ('Scheduled', 'PendingApproval')
        """, (v_id, v_date, v_time, id))
        conflict = cursor.fetchone()
        if conflict:
            conn.close()
            raise HTTPException(status_code=409, detail=f"Venue conflict: \"{conflict['name']}\" is already scheduled at this venue on {v_date} at {v_time}.")
            
    cursor.execute("""
        UPDATE events SET name = ?, category = ?, description = ?, date = ?, time = ?, venue_id = ?, capacity = ?, status = ?
        WHERE id = ?
    """, (
        event_data.name if event_data.name is not None else event['name'],
        event_data.category if event_data.category is not None else event['category'],
        event_data.description if event_data.description is not None else event['description'],
        event_data.date if event_data.date is not None else event['date'],
        event_data.time if event_data.time is not None else event['time'],
        event_data.venue_id if event_data.venue_id is not None else event['venue_id'],
        event_data.capacity if event_data.capacity is not None else event['capacity'],
        event_data.status if event_data.status is not None else event['status'],
        id
    ))
    
    if changed_schedule:
        cursor.execute("""
            SELECT DISTINCT student_id FROM (
               SELECT student_id FROM registrations WHERE event_id = ? AND status = 'Confirmed'
               UNION
               SELECT student_id FROM waitlist WHERE event_id = ? AND status = 'Waiting'
            )
        """, (id, id))
        students = cursor.fetchall()
        
        name = event_data.name if event_data.name is not None else event['name']
        for s in students:
            cursor.execute("INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)", (s['student_id'], id, f"The event \"{name}\" has an updated schedule/venue. Please check the details.", "Update"))
            
    conn.commit()
    
    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    updated = cursor.fetchone()
    result = with_counts(conn, updated)
    conn.close()
    
    return result

@router.delete("/{id}")
def delete_event(id: int, user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM events WHERE id = ?", (id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
        
    if user['role'] == "organiser" and event['organiser_id'] != user['id']:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only cancel events you organise.")
        
    cursor.execute("UPDATE events SET status = 'Cancelled' WHERE id = ?", (id,))
    
    cursor.execute("""
        SELECT DISTINCT student_id FROM (
           SELECT student_id FROM registrations WHERE event_id = ? AND status = 'Confirmed'
           UNION
           SELECT student_id FROM waitlist WHERE event_id = ? AND status = 'Waiting'
        )
    """, (id, id))
    students = cursor.fetchall()
    
    for s in students:
        cursor.execute("INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)", (s['student_id'], id, f"The event \"{event['name']}\" has been cancelled.", "Cancellation"))
        
    conn.commit()
    conn.close()
    
    return {"message": "Event cancelled."}
