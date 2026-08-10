from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import get_current_user, require_role

router = APIRouter()


class RegistrationCreate(BaseModel):
    event_id: int


class RegistrationStatusUpdate(BaseModel):
    status: Optional[str] = None
    attendance_status: Optional[str] = None


_VALID_STATUSES = {"Pending", "Confirmed", "Rejected", "Cancelled"}
_VALID_ATTENDANCE = {"Not Marked", "Present", "Absent"}


@router.post("")
def create_registration(req: RegistrationCreate, user: dict = Depends(require_role(["student"]))):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM events WHERE id = ?", (req.event_id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
    if event['status'] != "Scheduled":
        conn.close()
        raise HTTPException(status_code=400, detail="This event is not open for registration.")

    cursor.execute(
        "SELECT * FROM registrations WHERE student_id = ? AND event_id = ?",
        (user['id'], req.event_id)
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="You have already registered for this event.")

    cursor.execute(
        "SELECT * FROM waitlist WHERE student_id = ? AND event_id = ? AND status = 'Waiting'",
        (user['id'], req.event_id)
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="You are already on the waitlist for this event.")

    cursor.execute(
        "SELECT COUNT(*) FROM registrations WHERE event_id = ? AND status = 'Confirmed'",
        (req.event_id,)
    )
    confirmed_count = cursor.fetchone()[0]

    if confirmed_count < event['capacity']:
        cursor.execute(
            "INSERT INTO registrations (student_id, event_id, status) VALUES (?, ?, 'Confirmed')",
            (user['id'], req.event_id)
        )
        reg_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
            (user['id'], req.event_id, f"Registration confirmed for \"{event['name']}\".", "Confirmation")
        )
        conn.commit()

        cursor.execute("SELECT * FROM registrations WHERE id = ?", (reg_id,))
        reg = dict(cursor.fetchone())
        conn.close()
        return {"type": "registration", "registration": reg}
    else:
        cursor.execute(
            "INSERT INTO waitlist (student_id, event_id) VALUES (?, ?)",
            (user['id'], req.event_id)
        )
        w_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
            (user['id'], req.event_id, f"\"{event['name']}\" is full. You have been added to the waitlist.", "Waitlist")
        )
        conn.commit()

        cursor.execute("SELECT * FROM waitlist WHERE id = ?", (w_id,))
        w = dict(cursor.fetchone())
        conn.close()
        return {"type": "waitlist", "waitlist": w}


@router.get("/mine")
def get_my_registrations(user: dict = Depends(require_role(["student"]))):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT reg.*, e.name AS event_name, e.date, e.time, e.status AS event_status
        FROM registrations reg JOIN events e ON e.id = reg.event_id
        WHERE reg.student_id = ? ORDER BY e.date DESC
    """, (user['id'],))
    registrations = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
        SELECT w.*, e.name AS event_name, e.date, e.time
        FROM waitlist w JOIN events e ON e.id = w.event_id
        WHERE w.student_id = ? AND w.status = 'Waiting' ORDER BY e.date DESC
    """, (user['id'],))
    waitlist = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {"registrations": registrations, "waitlist": waitlist}


@router.delete("/{id}")
def cancel_registration(id: int, user: dict = Depends(require_role(["student"]))):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM registrations WHERE id = ?", (id,))
    reg = cursor.fetchone()
    if not reg or reg['student_id'] != user['id']:
        conn.close()
        raise HTTPException(status_code=404, detail="Registration not found.")

    if reg['status'] not in ('Confirmed', 'Pending'):
        conn.close()
        raise HTTPException(status_code=400, detail="Only confirmed or pending registrations can be cancelled.")

    cursor.execute("UPDATE registrations SET status = 'Cancelled' WHERE id = ?", (id,))

    # Promote the first person on the waitlist to fill the freed seat
    cursor.execute(
        "SELECT * FROM waitlist WHERE event_id = ? AND status = 'Waiting' ORDER BY joined_date ASC LIMIT 1",
        (reg['event_id'],)
    )
    next_w = cursor.fetchone()

    if next_w:
        cursor.execute("UPDATE waitlist SET status = 'Promoted' WHERE id = ?", (next_w['id'],))

        # Use INSERT OR IGNORE to handle the rare case where the waitlisted student
        # already has a Cancelled registration record (UNIQUE constraint on student_id+event_id)
        cursor.execute(
            "INSERT OR IGNORE INTO registrations (student_id, event_id, status) VALUES (?, ?, 'Confirmed')",
            (next_w['student_id'], next_w['event_id'])
        )
        # If the row already existed (Cancelled), update it to Confirmed
        if cursor.rowcount == 0:
            cursor.execute(
                "UPDATE registrations SET status = 'Confirmed' WHERE student_id = ? AND event_id = ?",
                (next_w['student_id'], next_w['event_id'])
            )

        cursor.execute("SELECT * FROM events WHERE id = ?", (next_w['event_id'],))
        event = cursor.fetchone()

        cursor.execute(
            "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
            (next_w['student_id'], next_w['event_id'],
             f"A seat opened up in \"{event['name']}\" — your waitlist registration is now confirmed!",
             "Confirmation")
        )

    conn.commit()
    conn.close()
    return {"message": "Registration cancelled."}


@router.get("/event/{event_id}")
def get_event_registrations(event_id: int, user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")

    if user['role'] == "organiser" and event['organiser_id'] != user['id']:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only view registrations for events you organise.")

    cursor.execute("""
        SELECT reg.*, u.name AS student_name, u.email, u.department, u.roll_no
        FROM registrations reg JOIN users u ON u.id = reg.student_id
        WHERE reg.event_id = ? ORDER BY reg.registration_date ASC
    """, (event_id,))
    registrations = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
        SELECT w.*, u.name AS student_name, u.email
        FROM waitlist w JOIN users u ON u.id = w.student_id
        WHERE w.event_id = ? AND w.status = 'Waiting' ORDER BY w.joined_date ASC
    """, (event_id,))
    waitlist = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {"registrations": registrations, "waitlist": waitlist}


@router.put("/{id}/status")
def update_registration_status(
    id: int,
    req: RegistrationStatusUpdate,
    user: dict = Depends(require_role(["organiser", "administrator"]))
):
    if req.status and req.status not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(_VALID_STATUSES)}")
    if req.attendance_status and req.attendance_status not in _VALID_ATTENDANCE:
        raise HTTPException(status_code=400, detail=f"Invalid attendance status. Must be one of: {', '.join(_VALID_ATTENDANCE)}")

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM registrations WHERE id = ?", (id,))
    reg = cursor.fetchone()
    if not reg:
        conn.close()
        raise HTTPException(status_code=404, detail="Registration not found.")

    status = req.status if req.status is not None else reg['status']
    attendance = req.attendance_status if req.attendance_status is not None else reg['attendance_status']

    cursor.execute(
        "UPDATE registrations SET status = ?, attendance_status = ? WHERE id = ?",
        (status, attendance, id)
    )

    if req.status:
        cursor.execute("SELECT * FROM events WHERE id = ?", (reg['event_id'],))
        event = cursor.fetchone()
        cursor.execute(
            "INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
            (reg['student_id'], reg['event_id'],
             f"Your registration for \"{event['name']}\" has been {req.status.lower()}.",
             "Status Update")
        )

    conn.commit()
    cursor.execute("SELECT * FROM registrations WHERE id = ?", (id,))
    updated = dict(cursor.fetchone())
    conn.close()
    return updated
