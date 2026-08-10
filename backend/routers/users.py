from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import get_db
from auth import get_current_user, require_role

router = APIRouter()

# Safe fields returned to clients — never expose password, google_id, or auth_provider
_PUBLIC_FIELDS = {"id", "name", "email", "role", "department", "roll_no", "contact_no", "created_at"}


class RoleUpdate(BaseModel):
    role: str


def to_public_user(user_row) -> dict:
    """Return only whitelisted public fields — never expose password or internal fields."""
    d = dict(user_row)
    return {k: v for k, v in d.items() if k in _PUBLIC_FIELDS}


@router.get("")
def get_users(user: dict = Depends(require_role(["administrator"]))):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users ORDER BY role, name")
    users = [to_public_user(r) for r in cursor.fetchall()]
    conn.close()
    return users


@router.put("/{id}/role")
def update_role(id: int, req: RoleUpdate, user: dict = Depends(require_role(["administrator"]))):
    if req.role not in ["student", "organiser", "administrator"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be student, organiser, or administrator.")

    # Prevent admin from changing their own role (could lock themselves out)
    if id == user['id']:
        raise HTTPException(status_code=400, detail="You cannot change your own role.")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (id,))
    target = cursor.fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")

    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (req.role, id))
    conn.commit()

    cursor.execute("SELECT * FROM users WHERE id = ?", (id,))
    updated = cursor.fetchone()
    conn.close()
    return to_public_user(updated)


@router.delete("/{id}")
def delete_user(id: int, user: dict = Depends(require_role(["administrator"]))):
    if id == user['id']:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")

    cursor.execute("DELETE FROM users WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return {"message": "User removed successfully."}
