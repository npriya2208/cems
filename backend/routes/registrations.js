const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// POST /api/registrations  (Use Case: "Browse and Register for Event")
// Verifies capacity, records registration or places on waitlist, sends confirmation notification.
router.post("/", authenticate, authorize("student"), (req, res) => {
  const { event_id } = req.body;
  if (!event_id) return res.status(400).json({ error: "event_id is required." });

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(event_id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (event.status !== "Scheduled") return res.status(400).json({ error: "This event is not open for registration." });

  const already = db
    .prepare("SELECT * FROM registrations WHERE student_id = ? AND event_id = ?")
    .get(req.user.id, event_id);
  if (already) return res.status(409).json({ error: "You have already registered for this event." });

  const alreadyWaitlisted = db
    .prepare("SELECT * FROM waitlist WHERE student_id = ? AND event_id = ? AND status = 'Waiting'")
    .get(req.user.id, event_id);
  if (alreadyWaitlisted) return res.status(409).json({ error: "You are already on the waitlist for this event." });

  const confirmedCount = db
    .prepare("SELECT COUNT(*) AS c FROM registrations WHERE event_id = ? AND status = 'Confirmed'")
    .get(event_id).c;

  const insertNotif = db.prepare(`INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)`);

  if (confirmedCount < event.capacity) {
    const info = db
      .prepare(
        `INSERT INTO registrations (student_id, event_id, status) VALUES (?, ?, 'Confirmed')`
      )
      .run(req.user.id, event_id);
    insertNotif.run(req.user.id, event_id, `Registration confirmed for "${event.name}".`, "Confirmation");
    const reg = db.prepare("SELECT * FROM registrations WHERE id = ?").get(info.lastInsertRowid);
    return res.status(201).json({ type: "registration", registration: reg });
  } else {
    // Use Case «extend»: "Join Waitlist" extends "Browse and Register for Event" when full
    const info = db
      .prepare(`INSERT INTO waitlist (student_id, event_id) VALUES (?, ?)`)
      .run(req.user.id, event_id);
    insertNotif.run(req.user.id, event_id, `"${event.name}" is full. You have been added to the waitlist.`, "Waitlist");
    const w = db.prepare("SELECT * FROM waitlist WHERE id = ?").get(info.lastInsertRowid);
    return res.status(201).json({ type: "waitlist", waitlist: w });
  }
});

// GET /api/registrations/mine  (Use Case: "View Registration Status")
router.get("/mine", authenticate, authorize("student"), (req, res) => {
  const registrations = db
    .prepare(
      `SELECT reg.*, e.name AS event_name, e.date, e.time, e.status AS event_status
       FROM registrations reg JOIN events e ON e.id = reg.event_id
       WHERE reg.student_id = ? ORDER BY e.date DESC`
    )
    .all(req.user.id);

  const waitlist = db
    .prepare(
      `SELECT w.*, e.name AS event_name, e.date, e.time
       FROM waitlist w JOIN events e ON e.id = w.event_id
       WHERE w.student_id = ? AND w.status = 'Waiting' ORDER BY e.date DESC`
    )
    .all(req.user.id);

  res.json({ registrations, waitlist });
});

// DELETE /api/registrations/:id  (cancel a registration; promotes next waitlisted student)
router.delete("/:id", authenticate, authorize("student"), (req, res) => {
  const reg = db.prepare("SELECT * FROM registrations WHERE id = ?").get(req.params.id);
  if (!reg || reg.student_id !== req.user.id) return res.status(404).json({ error: "Registration not found." });

  db.prepare("UPDATE registrations SET status = 'Cancelled' WHERE id = ?").run(reg.id);

  // Promote the earliest waiting student, if any (keeps capacity fully utilised)
  const next = db
    .prepare(
      `SELECT * FROM waitlist WHERE event_id = ? AND status = 'Waiting' ORDER BY joined_date ASC LIMIT 1`
    )
    .get(reg.event_id);

  if (next) {
    db.prepare("UPDATE waitlist SET status = 'Promoted' WHERE id = ?").run(next.id);
    db.prepare("INSERT INTO registrations (student_id, event_id, status) VALUES (?, ?, 'Confirmed')").run(
      next.student_id,
      next.event_id
    );
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(next.event_id);
    db.prepare(`INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)`).run(
      next.student_id,
      next.event_id,
      `A seat opened up in "${event.name}" — your waitlist registration is now confirmed!`,
      "Confirmation"
    );
  }

  res.json({ message: "Registration cancelled." });
});

// GET /api/registrations/event/:eventId  (organiser view: "Approve Registrations")
router.get("/event/:eventId", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.eventId);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (req.user.role === "organiser" && event.organiser_id !== req.user.id) {
    return res.status(403).json({ error: "You can only view registrations for events you organise." });
  }

  const registrations = db
    .prepare(
      `SELECT reg.*, u.name AS student_name, u.email, u.department, u.roll_no
       FROM registrations reg JOIN users u ON u.id = reg.student_id
       WHERE reg.event_id = ? ORDER BY reg.registration_date ASC`
    )
    .all(req.params.eventId);

  const waitlist = db
    .prepare(
      `SELECT w.*, u.name AS student_name, u.email
       FROM waitlist w JOIN users u ON u.id = w.student_id
       WHERE w.event_id = ? AND w.status = 'Waiting' ORDER BY w.joined_date ASC`
    )
    .all(req.params.eventId);

  res.json({ registrations, waitlist });
});

// PUT /api/registrations/:id/status  (organiser approves/rejects/marks attendance)
router.put("/:id/status", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const { status, attendance_status } = req.body;
  const reg = db.prepare("SELECT * FROM registrations WHERE id = ?").get(req.params.id);
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  db.prepare(
    "UPDATE registrations SET status = COALESCE(?, status), attendance_status = COALESCE(?, attendance_status) WHERE id = ?"
  ).run(status || null, attendance_status || null, reg.id);

  if (status) {
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(reg.event_id);
    db.prepare(`INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)`).run(
      reg.student_id,
      reg.event_id,
      `Your registration for "${event.name}" has been ${status.toLowerCase()}.`,
      "Status Update"
    );
  }

  const updated = db.prepare("SELECT * FROM registrations WHERE id = ?").get(reg.id);
  res.json(updated);
});

module.exports = router;
