from fastapi import APIRouter, Depends
from database import get_db

router = APIRouter()

@router.get("")
def get_venues():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM venues")
    venues = [dict(v) for v in cursor.fetchall()]
    conn.close()
    return venues
