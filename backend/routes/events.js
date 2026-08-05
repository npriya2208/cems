const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

function withCounts(event) {
  const confirmed = db
    .prepare("SELECT COUNT(*) AS c FROM registrations WHERE event_id = ? AND status = 'Confirmed'")
    .get(event.id).c;
  const waitlisted = db
    .prepare("SELECT COUNT(*) AS c FROM waitlist WHERE event_id = ? AND status = 'Waiting'")
    .get(event.id).c;
  const venue = event.venue_id ? db.prepare("SELECT * FROM venues WHERE id = ?").get(event.venue_id) : null;
  const resources = db
    .prepare(
      `SELECT r.id, r.name, er.quantity FROM event_resources er
       JOIN resources r ON r.id = er.resource_id WHERE er.event_id = ?`
    )
    .all(event.id);
  return {
    ...event,
    venue,
    resources,
    confirmedCount: confirmed,
    waitlistCount: waitlisted,
    seatsRemaining: Math.max(event.capacity - confirmed, 0),
  };
}

// GET /api/events  (Use Case: "Browse and Register for Event" - browse step)
router.get("/", (req, res) => {
  const { category, department, q } = req.query;
  let sql = "SELECT * FROM events WHERE status != 'Cancelled'";
  const params = [];
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (q) {
    sql += " AND (name LIKE ? OR description LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY date ASC, time ASC";
  const events = db.prepare(sql).all(...params);
  res.json(events.map(withCounts));
});

// GET /api/events/:id
router.get("/:id", (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  res.json(withCounts(event));
});

// POST /api/events  (Use Case: "Create and Manage Event") - organiser/admin only
router.post("/", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const { name, category, description, date, time, venue_id, capacity, resource_ids = [] } = req.body;

  if (!name || !date || !time || !capacity) {
    return res.status(400).json({ error: "name, date, time, and capacity are required." });
  }

  // Automatic venue/time conflict detection (SRS 4.1.2/4.1.3)
  if (venue_id) {
    const conflict = db
      .prepare(
        `SELECT * FROM events WHERE venue_id = ? AND date = ? AND time = ? AND status != 'Cancelled'`
      )
      .get(venue_id, date, time);
    if (conflict) {
      return res.status(409).json({
        error: `Venue conflict: "${conflict.name}" is already scheduled at this venue on ${date} at ${time}.`,
      });
    }
  }

  const info = db
    .prepare(
      `INSERT INTO events (name, category, description, date, time, venue_id, capacity, organiser_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, category || null, description || null, date, time, venue_id || null, capacity, req.user.id);

  const eventId = info.lastInsertRowid;

  const insertRes = db.prepare(`INSERT INTO event_resources (event_id, resource_id, quantity) VALUES (?, ?, ?)`);
  for (const r of resource_ids) {
    insertRes.run(eventId, r.resource_id, r.quantity || 1);
  }

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);
  res.status(201).json(withCounts(event));
});

// PUT /api/events/:id  (edit event) - triggers notification to registrants on change
router.put("/:id", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (req.user.role === "organiser" && event.organiser_id !== req.user.id) {
    return res.status(403).json({ error: "You can only edit events you organise." });
  }

  const { name, category, description, date, time, venue_id, capacity, status } = req.body;
  const changedSchedule = (date && date !== event.date) || (time && time !== event.time) || (venue_id && venue_id !== event.venue_id);

  if (venue_id && date && time) {
    const conflict = db
      .prepare(
        `SELECT * FROM events WHERE venue_id = ? AND date = ? AND time = ? AND id != ? AND status != 'Cancelled'`
      )
      .get(venue_id, date, time, event.id);
    if (conflict) {
      return res.status(409).json({
        error: `Venue conflict: "${conflict.name}" is already scheduled at this venue on ${date} at ${time}.`,
      });
    }
  }

  db.prepare(
    `UPDATE events SET name = ?, category = ?, description = ?, date = ?, time = ?, venue_id = ?, capacity = ?, status = ?
     WHERE id = ?`
  ).run(
    name ?? event.name,
    category ?? event.category,
    description ?? event.description,
    date ?? event.date,
    time ?? event.time,
    venue_id ?? event.venue_id,
    capacity ?? event.capacity,
    status ?? event.status,
    event.id
  );

  // Notify all registered/waitlisted students of schedule changes (SRS 4.2.3)
  if (changedSchedule) {
    const students = db
      .prepare(
        `SELECT DISTINCT student_id FROM (
           SELECT student_id FROM registrations WHERE event_id = ? AND status = 'Confirmed'
           UNION
           SELECT student_id FROM waitlist WHERE event_id = ? AND status = 'Waiting'
         )`
      )
      .all(event.id, event.id);
    const insertNotif = db.prepare(
      `INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)`
    );
    for (const s of students) {
      insertNotif.run(s.student_id, event.id, `The event "${name ?? event.name}" has an updated schedule/venue. Please check the details.`, "Update");
    }
  }

  const updated = db.prepare("SELECT * FROM events WHERE id = ?").get(event.id);
  res.json(withCounts(updated));
});

// DELETE /api/events/:id  (cancel event)
router.delete("/:id", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (req.user.role === "organiser" && event.organiser_id !== req.user.id) {
    return res.status(403).json({ error: "You can only cancel events you organise." });
  }

  db.prepare("UPDATE events SET status = 'Cancelled' WHERE id = ?").run(event.id);

  const students = db
    .prepare(
      `SELECT DISTINCT student_id FROM (
         SELECT student_id FROM registrations WHERE event_id = ? AND status = 'Confirmed'
         UNION
         SELECT student_id FROM waitlist WHERE event_id = ? AND status = 'Waiting'
       )`
    )
    .all(event.id, event.id);
  const insertNotif = db.prepare(`INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)`);
  for (const s of students) {
    insertNotif.run(s.student_id, event.id, `The event "${event.name}" has been cancelled.`, "Cancellation");
  }

  res.json({ message: "Event cancelled." });
});

// GET /api/events/mine/organised  (organiser's own events)
router.get("/mine/organised", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const events = db.prepare("SELECT * FROM events WHERE organiser_id = ? ORDER BY date DESC").all(req.user.id);
  res.json(events.map(withCounts));
});

module.exports = router;
