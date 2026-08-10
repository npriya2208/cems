import os
import jwt
from datetime import datetime, timedelta
from security import verify_password, get_password_hash  # noqa: F401 (re-exported below)
from fastapi import HTTPException, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

# Read from environment in production; fall back to a dev default for local runs.
# In production, set the SECRET_KEY environment variable to a long random string.
SECRET_KEY = os.environ.get("CEMS_SECRET_KEY", "dev_only_secret_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

# Set this to the OAuth 2.0 Client ID from Google Cloud Console
# (APIs & Services -> Credentials -> OAuth client ID -> Web application).
# The SAME client ID must be used on the frontend (see index.html).
# In production, set the GOOGLE_CLIENT_ID environment variable.
GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
)


def verify_google_token(token: str) -> dict:
    """
    Verifies a Google ID token (JWT) sent from the frontend's Sign in with
    Google button. Raises HTTPException on failure, otherwise returns the
    decoded payload containing at least 'sub', 'email', 'email_verified',
    'name'.
    """
    try:
        payload = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    if not payload.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google email is not verified")

    return payload


security = HTTPBearer()

# verify_password / get_password_hash are imported from security.py above
# and kept importable from `auth` too, since other modules do
# `from auth import get_password_hash` etc.


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please log in again.")


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    payload = decode_access_token(token)
    return payload


optional_security = HTTPBearer(auto_error=False)


def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Security(optional_security)) -> "dict | None":
    """
    Like get_current_user, but returns None instead of raising when no/invalid
    token is supplied. Used on endpoints that are public but behave slightly
    differently for a logged-in owner/admin (e.g. viewing a not-yet-approved event).
    """
    if not credentials:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except HTTPException:
        return None


def require_role(roles: List[str]):
    def role_checker(user: dict = Security(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden: Insufficient privileges")
        return user
    return role_checker
