import os
import random
import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from auth import get_password_hash, verify_password, create_access_token, get_current_user, verify_google_token
from validators import validate_email, validate_password_strength, validate_admission_number

router = APIRouter()

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_ATTEMPTS = 5

# --- SMTP configuration -----------------------------------------------------
# Real email delivery REQUIRES these three environment variables to be set:
#   CEMS_SMTP_HOST, CEMS_SMTP_USER, CEMS_SMTP_PASSWORD  (CEMS_SMTP_PORT optional, default 465)
#
# Example for Gmail:
#   1. Turn on 2-Step Verification on the Google account you'll send from.
#   2. Create an "App Password" at https://myaccount.google.com/apppasswords
#   3. Set:
#        CEMS_SMTP_HOST=smtp.gmail.com
#        CEMS_SMTP_PORT=465
#        CEMS_SMTP_USER=your.address@gmail.com
#        CEMS_SMTP_PASSWORD=<the 16-character app password>
#
# If these are NOT set, the server refuses to issue OTPs over email — it will
# NOT silently pretend to have sent one. (It only console-logs the code, which
# is useful for local dev, but the API call fails loudly so nobody thinks a
# real email went out when it didn't.)
SMTP_HOST = os.environ.get("CEMS_SMTP_HOST")
SMTP_PORT = int(os.environ.get("CEMS_SMTP_PORT", "465"))
SMTP_USER = os.environ.get("CEMS_SMTP_USER")
SMTP_PASSWORD = os.environ.get("CEMS_SMTP_PASSWORD")
SMTP_CONFIGURED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)

# Set CEMS_ALLOW_CONSOLE_OTP=1 to let the app run without real email delivery
# (OTP is printed to the server console/log instead of being emailed). This is
# OFF by default on purpose: without it, request-otp fails with a clear error
# if SMTP isn't configured, instead of silently claiming success while no
# email actually goes out (which is exactly what caused the "no OTP arrived"
# confusion). Turn it on only for local development if you don't want to set
# up SMTP yet.
ALLOW_CONSOLE_OTP = os.environ.get("CEMS_ALLOW_CONSOLE_OTP", "0") == "1"


class RequestOtpModel(BaseModel):
    name: str
    email: str
    password: str
    role: str
    department: Optional[str] = None
    roll_no: Optional[str] = None
    contact_no: Optional[str] = None


class VerifyOtpModel(BaseModel):
    email: str
    otp: str


class ResendOtpModel(BaseModel):
    email: str


class LoginModel(BaseModel):
    email: str
    password: str


class GoogleAuthModel(BaseModel):
    credential: str                    # The ID token from Google Identity Services
    role: Optional[str] = "student"    # Only used the first time a Google account signs in
    department: Optional[str] = None
    roll_no: Optional[str] = None
    contact_no: Optional[str] = None


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def _send_otp_email(to_email: str, otp: str) -> None:
    """
    Sends the OTP by real email via SMTP. Raises HTTPException (never fails
    silently) if email can't actually be delivered, UNLESS console-fallback
    is explicitly enabled for local development.
    """
    if not SMTP_CONFIGURED:
        if ALLOW_CONSOLE_OTP:
            print(f"[CEMS] SMTP not configured — OTP for {to_email} is {otp} (printed to console only)")
            return
        raise HTTPException(
            status_code=503,
            detail="Email delivery is not configured on this server. Set CEMS_SMTP_HOST / "
                   "CEMS_SMTP_USER / CEMS_SMTP_PASSWORD and try again."
        )

    msg = EmailMessage()
    msg["Subject"] = "Your CEMS Event Portal Verification Code"
    msg["From"] = SMTP_USER
    msg["To"] = to_email
    msg.set_content(
        f"Your OTP code for CEMS registration is: {otp}\n\n"
        f"This code expires in {OTP_TTL_MINUTES} minutes. Do not share this with anyone."
    )

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
    except Exception as e:
        print(f"[CEMS] Failed to send OTP email to {to_email}: {e}")
        raise HTTPException(
            status_code=502,
            detail="Failed to send the verification email. Please check the address and try again shortly."
        )


def _row_to_public_user(user_row) -> dict:
    return {
        "id": user_row["id"],
        "name": user_row["name"],
        "email": user_row["email"],
        "role": user_row["role"],
    }


def _issue_token_response(user_row) -> dict:
    access_token = create_access_token(data={
        "id": user_row["id"],
        "email": user_row["email"],
        "role": user_row["role"],
        "name": user_row["name"],
    })
    return {"token": access_token, "user": _row_to_public_user(user_row)}


# ---------------------------------------------------------------------------
# Step 1: validate registration details and email an OTP.
# The pending row lives ONLY in `pending_registrations`. Nothing is written
# to `users` until the OTP is verified in step 2 — so an incomplete
# registration never shows up as an account (no login, no listing, nothing).
# ---------------------------------------------------------------------------
@router.post("/register/request-otp")
def request_otp(payload: RequestOtpModel):
    if payload.role not in ("student", "organiser", "administrator"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be student, organiser, or administrator.")

    name = payload.name.strip()
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters.")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="Name must be 100 characters or fewer.")

    email = payload.email.strip().lower()
    is_valid_email, email_err = validate_email(email)
    if not is_valid_email:
        raise HTTPException(status_code=400, detail=email_err)

    is_strong, pwd_err = validate_password_strength(payload.password)
    if not is_strong:
        raise HTTPException(status_code=400, detail=pwd_err)

    # --- Admission number validation (students only) ---
    roll_no = (payload.roll_no or "").strip().upper()
    if payload.role == "student":
        if not roll_no:
            raise HTTPException(status_code=400, detail="Admission number is required for students.")
        is_valid_roll, roll_err = validate_admission_number(roll_no)
        if not is_valid_roll:
            raise HTTPException(status_code=400, detail=roll_err)

    conn = get_db()
    try:
        cursor = conn.cursor()

        # Already a real, verified account under this email -> can't register again.
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in instead.")

        otp = _generate_otp()
        otp_expires_at = (datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()
        hashed_pwd = get_password_hash(payload.password)

        # Upsert the pending registration (a retry with a new OTP just
        # overwrites the previous unverified attempt for that email).
        cursor.execute("SELECT id FROM pending_registrations WHERE LOWER(email) = ?", (email,))
        existing_pending = cursor.fetchone()

        if existing_pending:
            cursor.execute("""
                UPDATE pending_registrations
                SET name = ?, password = ?, role = ?, department = ?, roll_no = ?, contact_no = ?,
                    otp_code = ?, otp_expires_at = ?, attempt_count = 0
                WHERE id = ?
            """, (name, hashed_pwd, payload.role, payload.department or None,
                  roll_no or None, payload.contact_no or None,
                  otp, otp_expires_at, existing_pending["id"]))
        else:
            cursor.execute("""
                INSERT INTO pending_registrations
                    (name, email, password, role, department, roll_no, contact_no, otp_code, otp_expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, email, hashed_pwd, payload.role, payload.department or None,
                  roll_no or None, payload.contact_no or None, otp, otp_expires_at))

        # Send the email BEFORE committing so a delivery failure leaves no
        # dangling pending row with an OTP the user never received.
        _send_otp_email(email, otp)

        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")
    finally:
        conn.close()

    return {"message": f"An OTP was sent to {email}. It expires in {OTP_TTL_MINUTES} minutes."}


@router.post("/register/resend-otp")
def resend_otp(payload: ResendOtpModel):
    email = payload.email.strip().lower()

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pending_registrations WHERE LOWER(email) = ?", (email,))
        pending = cursor.fetchone()
        if not pending:
            raise HTTPException(status_code=400, detail="No pending registration found for this email. Please start registration again.")

        otp = _generate_otp()
        otp_expires_at = (datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()

        _send_otp_email(email, otp)

        cursor.execute("UPDATE pending_registrations SET otp_code = ?, otp_expires_at = ?, attempt_count = 0 WHERE id = ?",
                        (otp, otp_expires_at, pending["id"]))
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {"message": f"A new OTP was sent to {email}."}


# ---------------------------------------------------------------------------
# Step 2: verify the OTP and promote the pending registration into `users`.
# ---------------------------------------------------------------------------
@router.post("/register/verify-otp")
def verify_otp(payload: VerifyOtpModel):
    email = payload.email.strip().lower()
    otp = (payload.otp or "").strip()

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pending_registrations WHERE LOWER(email) = ?", (email,))
        pending = cursor.fetchone()

        if not pending:
            raise HTTPException(status_code=404, detail="No pending registration found for this email. Please start registration again.")

        if pending["attempt_count"] >= OTP_MAX_ATTEMPTS:
            cursor.execute("DELETE FROM pending_registrations WHERE id = ?", (pending["id"],))
            conn.commit()
            raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please register again to get a new code.")

        if datetime.utcnow() > datetime.fromisoformat(pending["otp_expires_at"]):
            raise HTTPException(status_code=400, detail="This OTP has expired. Please request a new one.")

        if otp != pending["otp_code"]:
            cursor.execute("UPDATE pending_registrations SET attempt_count = attempt_count + 1 WHERE id = ?", (pending["id"],))
            conn.commit()
            raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")

        # Correct OTP -> promote into `users`, atomically remove the pending row.
        try:
            cursor.execute("""
                INSERT INTO users (name, email, password, role, department, roll_no, contact_no, auth_provider)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'local')
            """, (pending["name"], pending["email"], pending["password"], pending["role"],
                  pending["department"], pending["roll_no"], pending["contact_no"]))
        except Exception as e:
            if "UNIQUE" in str(e):
                # Someone else finished registering with this email in the meantime.
                cursor.execute("DELETE FROM pending_registrations WHERE id = ?", (pending["id"],))
                conn.commit()
                raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in instead.")
            raise

        new_user_id = cursor.lastrowid
        cursor.execute("DELETE FROM pending_registrations WHERE id = ?", (pending["id"],))
        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?", (new_user_id,))
        new_user = cursor.fetchone()
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

    return _issue_token_response(new_user)


@router.post("/login")
def login(creds: LoginModel):
    if not creds.email or not creds.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (creds.email.strip().lower(),))
    user = cursor.fetchone()

    if not user:
        # Give a more specific hint if there's an unfinished registration waiting on OTP.
        cursor.execute("SELECT id FROM pending_registrations WHERE LOWER(email) = ?", (creds.email.strip().lower(),))
        pending = cursor.fetchone()
        conn.close()
        if pending:
            raise HTTPException(status_code=403, detail="Please finish verifying your email with the OTP before logging in.")
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    conn.close()

    if not user["password"] or not verify_password(creds.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    return _issue_token_response(user)


@router.post("/google")
def google_auth(payload: GoogleAuthModel):
    """
    Sign in (or sign up) with Google. The frontend sends the ID token it got
    from Google Identity Services; we verify it server-side, then find/create
    the matching `users` row directly — Google has already verified the email
    address for us, so no OTP step is needed here.
    """
    google_payload = verify_google_token(payload.credential)
    google_id = google_payload["sub"]
    email = google_payload["email"].strip().lower()
    name = google_payload.get("name") or email.split("@")[0]

    is_valid_email, email_err = validate_email(email)
    if not is_valid_email:
        raise HTTPException(status_code=400, detail=email_err)

    role = payload.role if payload.role in ("student", "organiser", "administrator") else "student"

    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE google_id = ?", (google_id,))
        user = cursor.fetchone()

        if not user:
            cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email,))
            user = cursor.fetchone()
            if user:
                cursor.execute("UPDATE users SET google_id = ? WHERE id = ?", (google_id, user["id"]))
                conn.commit()
            else:
                try:
                    cursor.execute("""
                        INSERT INTO users (name, email, password, role, department, roll_no, contact_no,
                                            google_id, auth_provider)
                        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'google')
                    """, (name, email, role,
                          payload.department or None, payload.roll_no or None, payload.contact_no or None,
                          google_id))
                    conn.commit()
                except Exception:
                    raise HTTPException(status_code=500, detail="Google sign-up failed. Please try again.")

            cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email,))
            user = cursor.fetchone()

        if not user:
            raise HTTPException(status_code=500, detail="Failed to retrieve user after Google sign-in.")
    finally:
        conn.close()

    return _issue_token_response(user)


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Returns the current authenticated user's profile from the JWT payload."""
    return {
        "id": current_user.get("id"),
        "name": current_user.get("name"),
        "email": current_user.get("email"),
        "role": current_user.get("role"),
    }
