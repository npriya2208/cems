"""
Password hashing helpers.

We use the `bcrypt` library directly instead of `passlib`. passlib hasn't
been released since 2020 and its bcrypt backend breaks on modern bcrypt
versions (it probes for a `bcrypt.__about__` attribute that newer bcrypt
releases removed), causing crashes like:

    AttributeError: module 'bcrypt' has no attribute '__about__'
    ValueError: password cannot be longer than 72 bytes...

Calling bcrypt directly avoids that whole class of version-mismatch bugs.
"""
import bcrypt

# bcrypt has a hard 72-byte input limit. Passwords are truncated (not
# rejected) at that length, matching passlib's previous "bcrypt" behaviour.
_MAX_BCRYPT_BYTES = 72


def get_password_hash(password: str) -> str:
    """Hash a plaintext password for storage."""
    pw_bytes = password.encode("utf-8")[:_MAX_BCRYPT_BYTES]
    hashed = bcrypt.hashpw(pw_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plaintext password against a stored bcrypt hash."""
    pw_bytes = plain_password.encode("utf-8")[:_MAX_BCRYPT_BYTES]
    try:
        return bcrypt.checkpw(pw_bytes, hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed/unrecognised hash in the DB — treat as "does not match"
        # rather than letting the exception bubble up as a 500.
        return False
