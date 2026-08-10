import csv
import io
from fastapi import APIRouter, Depends, Response
from database import get_db
from auth import get_current_user, require_role

router = APIRouter()


def _csv_safe(value: str) -> str:
    """
    Neutralise CSV/formula injection: if a cell starts with =, +, -, or @,
    Excel/Sheets may interpret it as a formula when the file is opened.
    Prefixing with a single quote forces it to be treated as plain text.
    """
    if value and value[0] in ("=", "+", "-", "@"):
        return "'" + value
    return value

@router.get("/organiser")
def get_organiser_analytics(user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE organiser_id = ?", (user['id'],))
    events = cursor.fetchall()
    
    per_event = []
    total_confirmed = 0
    for e in events:
        cursor.execute("SELECT COUNT(*) FROM registrations WHERE event_id = ? AND status='Confirmed'", (e['id'],))
        confirmed = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM waitlist WHERE event_id = ? AND status='Waiting'", (e['id'],))
        waitlisted = cursor.fetchone()[0]
        
        cursor.execute("SELECT AVG(rating) FROM feedback WHERE event_id = ?", (e['id'],))
        avg_res = cursor.fetchone()[0]
        
        utilisation = round((confirmed / e['capacity']) * 100) if e['capacity'] else 0
        avg_rating = round(avg_res, 1) if avg_res else None
        
        total_confirmed += confirmed
        
        per_event.append({
            "id": e['id'],
            "name": e['name'],
            "date": e['date'],
            "capacity": e['capacity'],
            "confirmed": confirmed,
            "waitlisted": waitlisted,
            "utilisation": utilisation,
            "avgRating": avg_rating
        })
        
    conn.close()
    return {
        "totalEvents": len(events),
        "totalRegistrations": total_confirmed,
        "events": per_event
    }

@router.get("/admin")
def get_admin_analytics(user: dict = Depends(require_role(["administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    
    totals = {}
    cursor.execute("SELECT COUNT(*) FROM users")
    totals["users"] = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM users WHERE role='student'")
    totals["students"] = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM users WHERE role='organiser'")
    totals["organisers"] = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM events WHERE status != 'Cancelled'")
    totals["events"] = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM registrations WHERE status='Confirmed'")
    totals["registrations"] = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM waitlist WHERE status='Waiting'")
    totals["waitlisted"] = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COALESCE(category,'Uncategorised') AS category, COUNT(*) AS eventCount
        FROM events WHERE status != 'Cancelled' GROUP BY category
    """)
    by_category = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("""
        SELECT COALESCE(u.department, 'Unspecified') AS department, COUNT(*) AS registrationCount
        FROM registrations r JOIN users u ON u.id = r.student_id
        WHERE r.status = 'Confirmed' GROUP BY u.department
    """)
    by_department = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT id, name, date, time, category FROM events WHERE status='Scheduled' AND date >= date('now') ORDER BY date LIMIT 5")
    upcoming = [dict(r) for r in cursor.fetchall()]
    
    conn.close()
    return {
        "totals": totals,
        "byCategory": by_category,
        "byDepartment": by_department,
        "upcoming": upcoming
    }

@router.get("/report.csv")
def get_report_csv(user: dict = Depends(require_role(["organiser", "administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    
    if user['role'] == 'administrator':
        cursor.execute("SELECT * FROM events")
    else:
        cursor.execute("SELECT * FROM events WHERE organiser_id = ?", (user['id'],))
    events = cursor.fetchall()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Event Name", "Category", "Date", "Time", "Capacity", "Confirmed", "Waitlisted", "Status"])

    for e in events:
        cursor.execute("SELECT COUNT(*) FROM registrations WHERE event_id=? AND status='Confirmed'", (e['id'],))
        confirmed = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM waitlist WHERE event_id=? AND status='Waiting'", (e['id'],))
        waitlisted = cursor.fetchone()[0]
        cat = e['category'] if e['category'] else ""
        writer.writerow([
            _csv_safe(e['name']), _csv_safe(cat), e['date'], e['time'],
            e['capacity'], confirmed, waitlisted, e['status'],
        ])

    conn.close()
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cems_report.csv"},
    )
