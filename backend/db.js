const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "cems.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------
// SCHEMA
// Mirrors the Class Diagram from Experiment 3:
// User (Student/Organiser/Administrator), Event, Registration, Venue,
// Resource, Notification, Waitlist, Feedback, Report
// ---------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','organiser','administrator')),
  department TEXT,
  roll_no TEXT,
  contact_no TEXT,
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
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Cancelled','Completed')),
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
`);

// ---------------------------------------------------------------------
// SEED DATA (only runs once, when the users table is empty)
// ---------------------------------------------------------------------
const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;

if (userCount === 0) {
  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password, role, department, roll_no, contact_no)
    VALUES (@name, @email, @password, @role, @department, @roll_no, @contact_no)
  `);

  const seedUsers = [
    { name: "Priya Sharma", email: "student@cems.edu", password: hash("password123"), role: "student", department: "Computer Engineering", roll_no: "CE45", contact_no: "9876543210" },
    { name: "Karan Verma", email: "organiser@cems.edu", password: hash("password123"), role: "organiser", department: "Cultural Committee", roll_no: null, contact_no: "9876500000" },
    { name: "System Admin", email: "admin@cems.edu", password: hash("password123"), role: "administrator", department: null, roll_no: null, contact_no: null },
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insertUser.run(r)));
  insertMany(seedUsers);

  const insertVenue = db.prepare(`INSERT INTO venues (name, location, capacity) VALUES (?, ?, ?)`);
  insertVenue.run("Main Auditorium", "Block A", 250);
  insertVenue.run("Seminar Hall", "Block B", 100);
  insertVenue.run("Computer Lab", "Block C", 60);

  const insertResource = db.prepare(`INSERT INTO resources (name, quantity, description) VALUES (?, ?, ?)`);
  insertResource.run("HD Projector", 4, "Portable projector units");
  insertResource.run("Microphone Set", 6, "Wireless mic set");
  insertResource.run("Laptops", 20, "For coding competitions/workshops");

  const organiserId = db.prepare("SELECT id FROM users WHERE email = ?").get("organiser@cems.edu").id;
  const insertEvent = db.prepare(`
    INSERT INTO events (name, category, description, date, time, venue_id, capacity, organiser_id)
    VALUES (@name, @category, @description, @date, @time, @venue_id, @capacity, @organiser_id)
  `);
  insertEvent.run({
    name: "Tech Fest 2026",
    category: "Technical",
    description: "Annual college-wide technical fest featuring coding contests, hackathons, and tech talks.",
    date: "2026-09-25",
    time: "10:00",
    venue_id: 1,
    capacity: 3,
    organiser_id: organiserId,
  });
  insertEvent.run({
    name: "Coding Competition",
    category: "Technical",
    description: "Competitive programming contest open to all departments.",
    date: "2026-09-10",
    time: "11:00",
    venue_id: 3,
    capacity: 2,
    organiser_id: organiserId,
  });
  insertEvent.run({
    name: "Cultural Night",
    category: "Cultural",
    description: "An evening of music, dance, and drama performances by student clubs.",
    date: "2026-10-05",
    time: "18:00",
    venue_id: 2,
    capacity: 100,
    organiser_id: organiserId,
  });

  console.log("Seed data inserted: 3 users, 3 venues, 3 resources, 3 events.");
  console.log("Demo logins -> student@cems.edu / organiser@cems.edu / admin@cems.edu (password: password123)");
}

module.exports = db;
