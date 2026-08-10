from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import get_current_user, require_role

router = APIRouter()

class BroadcastRequest(BaseModel):
    event_id: int
    message: str

@router.get("/mine")
def get_my_notifications(user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_date DESC", (user['id'],))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

@router.put("/{id}/read")
def mark_read(id: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications WHERE id = ?", (id,))
    n = cursor.fetchone()
    if not n or n['user_id'] != user['id']:
        conn.close()
        raise HTTPException(status_code=404, detail="Notification not found.")
        
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"message": "Marked as read."}

@router.post("/broadcast")
def broadcast(req: BroadcastRequest, user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM events WHERE id = ?", (req.event_id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
        
    if user['role'] == "organiser" and event['organiser_id'] != user['id']:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only notify registrants of events you organise.")
        
    cursor.execute("""
        SELECT DISTINCT student_id FROM (
           SELECT student_id FROM registrations WHERE event_id = ? AND status = 'Confirmed'
           UNION
           SELECT student_id FROM waitlist WHERE event_id = ? AND status = 'Waiting'
        )
    """, (req.event_id, req.event_id))
    students = cursor.fetchall()
    
    for s in students:
        cursor.execute("INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)",
                      (s['student_id'], req.event_id, req.message, "Announcement"))
                      
    conn.commit()
    conn.close()
    return {"message": f"Notification sent to {len(students)} student(s)."}
