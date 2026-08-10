from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_db
from auth import get_current_user, require_role

router = APIRouter()

class FeedbackCreate(BaseModel):
    event_id: int
    rating: int
    comments: Optional[str] = None

@router.post("")
def submit_feedback(req: FeedbackCreate, user: dict = Depends(require_role(["student"]))):
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="rating must be between 1 and 5.")
        
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM registrations WHERE student_id = ? AND event_id = ? AND status = 'Confirmed'", (user['id'], req.event_id))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="You can only give feedback for events you registered for.")
        
    cursor.execute("SELECT * FROM feedback WHERE student_id = ? AND event_id = ?", (user['id'], req.event_id))
    existing = cursor.fetchone()
    
    if existing:
        cursor.execute("UPDATE feedback SET rating = ?, comments = ? WHERE id = ?", (req.rating, req.comments, existing['id']))
        f_id = existing['id']
    else:
        cursor.execute("INSERT INTO feedback (student_id, event_id, rating, comments) VALUES (?, ?, ?, ?)", (user['id'], req.event_id, req.rating, req.comments))
        f_id = cursor.lastrowid
        
    conn.commit()
    cursor.execute("SELECT * FROM feedback WHERE id = ?", (f_id,))
    result = dict(cursor.fetchone())
    conn.close()
    
    return result

@router.get("/event/{event_id}")
def get_event_feedback(event_id: int, user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT f.*, u.name AS student_name FROM feedback f JOIN users u ON u.id = f.student_id WHERE f.event_id = ?
    """, (event_id,))
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows
