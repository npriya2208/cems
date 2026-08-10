from fastapi import APIRouter
from database import get_db

router = APIRouter()

@router.get("")
def get_resources():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM resources")
    resources = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return resources
