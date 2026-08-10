import sqlite3
import os
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_PATH = os.path.join(os.path.dirname(__file__), "cems.db")


def get_db() -> sqlite3.Connection:
    """
    Opens a SQLite connection with WAL journal mode and foreign-key enforcement.
    Foreign keys MUST be re-enabled per connection — init_db alone is not enough.
    """
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT,
      role TEXT NOT NULL CHECK(role IN ('student','organiser','administrator')),
      department TEXT,
      roll_no TEXT,
      contact_no TEXT,
      google_id TEXT UNIQUE,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Unverified registrations live here ONLY, never in `users`. A row only
    -- gets promoted into `users` once the correct OTP is supplied, so the
    -- `users` table never contains an account that hasn't proven mail ownership.
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','organiser','administrator')),
      department TEXT,
      roll_no TEXT,
      contact_no TEXT,
      otp_code TEXT NOT NULL,
      otp_expires_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      capacity INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      venue_id INTEGER REFERENCES venues(id),
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PendingApproval' CHECK(status IN ('PendingApproval','Scheduled','Rejected','Cancelled','Completed')),
      organiser_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      resource_id INTEGER NOT NULL REFERENCES resources(id),
      quantity INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Rejected','Cancelled')),
      attendance_status TEXT DEFAULT 'Not Marked',
      registration_date TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      joined_date TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'Waiting' CHECK(status IN ('Waiting','Promoted','Left')),
      UNIQUE(student_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id),
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comments TEXT,
      submitted_date TEXT DEFAULT (datetime('now')),
      UNIQUE(student_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER REFERENCES events(id),
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Info',
      sent_date TEXT DEFAULT (datetime('now')),
      is_read INTEGER NOT NULL DEFAULT 0
    );
    """)

    # --- Lightweight migration for databases created before google_id/auth_provider
    # existed, or where password was NOT NULL. SQLite can't drop NOT NULL directly,
    # so we only add the new columns here; the NOT NULL constraint on `password`
    # only affects brand-new tables created by the executescript above.
    existing_cols = {row["name"] for row in cursor.execute("PRAGMA table_info(users)")}
    if "google_id" not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)")
    if "auth_provider" not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'")
    # NOTE: earlier builds stored is_verified/otp_code/otp_expires_at directly
    # on `users`. That data now lives in `pending_registrations` instead and
    # unverified rows are never written to `users` at all, so no migration of
    # those old columns is needed going forward — SQLite simply ignores them
    # if they're still physically present in an old database file.

    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]

    if user_count == 0:
        print("Seeding database with demo data...")
        # Seed users — demo passwords are intentionally simple; password strength
        # validation only applies at the /register API endpoint, not to seeds.
        seed_users = [
            ("Priya Sharma", "student@cems.edu", pwd_context.hash("password123"), "student", "Computer Engineering", "CE45", "9876543210"),
            ("Karan Verma", "organiser@cems.edu", pwd_context.hash("password123"), "organiser", "Cultural Committee", None, "9876500000"),
            ("System Admin", "admin@cems.edu", pwd_context.hash("password123"), "administrator", None, None, None)
        ]
        cursor.executemany("""
            INSERT INTO users (name, email, password, role, department, roll_no, contact_no)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, seed_users)

        # Seed venues
        seed_venues = [
            ("Main Auditorium", "Block A", 250),
            ("Seminar Hall", "Block B", 100),
            ("Computer Lab", "Block C", 60)
        ]
        cursor.executemany("INSERT INTO venues (name, location, capacity) VALUES (?, ?, ?)", seed_venues)

        # Seed resources
        seed_resources = [
            ("HD Projector", 4, "Portable projector units"),
            ("Microphone Set", 6, "Wireless mic set"),
            ("Laptops", 20, "For coding competitions/workshops")
        ]
        cursor.executemany("INSERT INTO resources (name, quantity, description) VALUES (?, ?, ?)", seed_resources)

        cursor.execute("SELECT id FROM users WHERE email = ?", ("organiser@cems.edu",))
        organiser_id = cursor.fetchone()[0]

        seed_events = [
            ("Tech Fest 2026", "Technical", "Annual college-wide technical fest featuring coding contests, hackathons, and tech talks.", "2026-09-25", "10:00", 1, 3, organiser_id),
            ("Coding Competition", "Technical", "Competitive programming contest open to all departments.", "2026-09-10", "11:00", 3, 2, organiser_id),
            ("Cultural Night", "Cultural", "An evening of music, dance, and drama performances by student clubs.", "2026-10-05", "18:00", 2, 100, organiser_id)
        ]
        cursor.executemany("""
            INSERT INTO events (name, category, description, date, time, venue_id, capacity, organiser_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled')
        """, seed_events)

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
