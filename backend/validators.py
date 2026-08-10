"""
Validation helpers for user registration:
 - Email format validation (rejects incomplete domains like '@gmail' or '@student.mes')
 - Email domain existence check via DNS (MX/A record) so half-typed domains are rejected
 - Password strength enforcement (upper, lower, digit, special char, min length)
"""
import re
import socket
from typing import Optional, Tuple

try:
    import dns.resolver  # provided by dnspython
    _HAS_DNSPYTHON = True
except ImportError:
    _HAS_DNSPYTHON = False

# Standard RFC-5322-ish email pattern:
#   local-part @ label(.label)+ where the final label (TLD) is letters only, length >= 2
# This accepts user@college.ac.in, user@student.mes.ac.in, user@student.pillai.edu.in,
# user@gmail.com, etc., and rejects things with no TLD segment at all (user@gmail,
# user@localhost) or malformed local parts.
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9](?:[a-zA-Z0-9._%+\-]*[a-zA-Z0-9])?"
    r"@"
    r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)"
    r"+[a-zA-Z]{2,}$"
)

PASSWORD_REGEX_PARTS = {
    "uppercase": re.compile(r"[A-Z]"),
    "lowercase": re.compile(r"[a-z]"),
    "digit": re.compile(r"\d"),
    "special": re.compile(r"[!@#$%^&*()\-_=+\[\]{};:'\",.<>/?\\|`~]"),
}

MIN_PASSWORD_LENGTH = 8

# --- Admission / roll number validation ---------------------------------
# Format: <BRANCH PREFIX><YYYY><SSSS>, e.g. CE20230001.
# Valid range per branch: <PREFIX>20230001 to <PREFIX>20241000 inclusive
# (i.e. any serial in academic year 2023, plus serials 0001-1000 of 2024).
ADMISSION_NO_MIN = 20230001
ADMISSION_NO_MAX = 20241000
ADMISSION_NO_PREFIXES = ["CE", "EXTC", "IT", "MECH", "ECS", "AUTO"]
ADMISSION_NO_REGEX = re.compile(
    r"^(" + "|".join(ADMISSION_NO_PREFIXES) + r")(\d{8})$"
)


def validate_admission_number(roll_no: str) -> Tuple[bool, Optional[str]]:
    """
    Returns (is_valid: bool, error_message: str | None).
    Accepts e.g. CE20230001 ... CE20241000, EXTC20230001 ... EXTC20241000, etc.
    """
    roll_no = (roll_no or "").strip().upper()

    match = ADMISSION_NO_REGEX.match(roll_no)
    if not match:
        return False, (
            "Admission number must be one of " + ", ".join(ADMISSION_NO_PREFIXES) +
            " followed by an 8-digit year+serial code, e.g. CE20230001."
        )

    number = int(match.group(2))
    if not (ADMISSION_NO_MIN <= number <= ADMISSION_NO_MAX):
        prefix = match.group(1)
        return False, (
            f"Admission number must be between {prefix}{ADMISSION_NO_MIN} "
            f"and {prefix}{ADMISSION_NO_MAX}."
        )

    return True, None

ALLOWED_DOMAINS = [
    r"gmail\.com",
    r"student\.mes\.ac\.in",
    r"student\.pillai\.edu\.in",
    r"mes\.ac\.in",
    r"pillai\.edu\.in"
]

def validate_email_domain(email: str) -> bool:
    """Check if the email domain is in the list of allowed domains."""
    email = email.strip().lower()
    # Matches username @ allowed_domain
    domain_pattern = r"^[\w\.-]+@(" + "|".join(ALLOWED_DOMAINS) + r")$"
    return bool(re.match(domain_pattern, email))

def domain_has_dns_record(domain: str, timeout: float = 3.0) -> Optional[bool]:
    """
    Checks whether the email's domain actually resolves (has an MX record, or
    failing that an A/AAAA record). This is what catches things like
    '@student.mes' (looks plausible but doesn't exist) vs '@student.mes.ac.in'
    (a real, resolvable subdomain).

    Returns:
        True  -> domain resolves, looks legitimate
        False -> domain does NOT resolve (NXDOMAIN / no records) -> reject
        None  -> couldn't determine (network/DNS server unreachable) -> caller
                 should treat this as "skip the check" rather than a hard fail,
                 so registration doesn't break just because the server itself
                 has no internet access.
    """
    if _HAS_DNSPYTHON:
        resolver = dns.resolver.Resolver()
        resolver.timeout = timeout
        resolver.lifetime = timeout
        try:
            resolver.resolve(domain, "MX")
            return True
        except dns.resolver.NXDOMAIN:
            return False
        except dns.resolver.NoAnswer:
            # No MX record — fall back to A/AAAA
            try:
                resolver.resolve(domain, "A")
                return True
            except dns.resolver.NXDOMAIN:
                return False
            except Exception:
                return None
        except Exception:
            # Timeout / no network / DNS server unreachable — can't decide
            return None
    else:
        # Fallback with stdlib only: plain A-record style lookup
        try:
            socket.setdefaulttimeout(timeout)
            socket.getaddrinfo(domain, None)
            return True
        except socket.gaierror:
            return False
        except Exception:
            return None


def is_valid_email_format(email: str) -> bool:
    """Basic RFC-5322-ish structural check (does NOT check the allow-list)."""
    return bool(EMAIL_REGEX.match(email or ""))


def validate_email(email: str, check_dns: bool = False) -> Tuple[bool, Optional[str]]:
    """
    Returns (is_valid: bool, error_message: str | None).
    Consistent tuple return — never raises.

    Enforces, in order:
      1. Structural email format
      2. Membership in the college's allow-list of domains (ALLOWED_DOMAINS)
      3. (optional) DNS resolvability of the domain

    check_dns defaults to False because DNS lookups on institutional
    subdomains are frequently unreliable/slow from arbitrary networks and
    are redundant once the domain is already restricted to a known allow-list.
    """
    email = (email or "").strip().lower()

    if not is_valid_email_format(email):
        return False, (
            "Enter a complete, valid email address (e.g. name@college.edu.in)."
        )

    if not validate_email_domain(email):
        allowed = ", ".join(sorted({d.replace("\\.", ".") for d in ALLOWED_DOMAINS}))
        return False, f"Email must belong to one of the allowed domains: {allowed}."

    if check_dns:
        domain = email.rsplit("@", 1)[-1]
        exists = domain_has_dns_record(domain)
        if exists is False:
            return False, f"The domain '{domain}' does not appear to exist. Please check your email address."
        # exists is True or None (undeterminable) -> allow through

    return True, None


def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
    """
    Returns (is_valid: bool, error_message: str | None).
    Consistent tuple return — never raises. Callers decide how to surface the error.
    """
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."

    if not PASSWORD_REGEX_PARTS["uppercase"].search(password):
        return False, "Password must contain at least one uppercase letter."

    if not PASSWORD_REGEX_PARTS["lowercase"].search(password):
        return False, "Password must contain at least one lowercase letter."

    if not PASSWORD_REGEX_PARTS["digit"].search(password):
        return False, "Password must contain at least one number."

    if not PASSWORD_REGEX_PARTS["special"].search(password):
        return False, "Password must contain at least one special character."

    return True, None