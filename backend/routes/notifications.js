const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/notifications/mine
router.get("/mine", authenticate, (req, res) => {
  const notifications = db
    .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_date DESC")
    .all(req.user.id);
  res.json(notifications);
});

// PUT /api/notifications/:id/read
router.put("/:id/read", authenticate, (req, res) => {
  const n = db.prepare("SELECT * FROM notifications WHERE id = ?").get(req.params.id);
  if (!n || n.user_id !== req.user.id) return res.status(404).json({ error: "Notification not found." });
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(n.id);
  res.json({ message: "Marked as read." });
});

// POST /api/notifications/broadcast  (Use Case: "Send Notifications and Alerts" - custom announcement)
router.post("/broadcast", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const { event_id, message } = req.body;
  if (!event_id || !message) return res.status(400).json({ error: "event_id and message are required." });

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(event_id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (req.user.role === "organiser" && event.organiser_id !== req.user.id) {
    return res.status(403).json({ error: "You can only notify registrants of events you organise." });
  }

  const students = db
    .prepare(
      `SELECT DISTINCT student_id FROM (
         SELECT student_id FROM registrations WHERE event_id = ? AND status = 'Confirmed'
         UNION
         SELECT student_id FROM waitlist WHERE event_id = ? AND status = 'Waiting'
       )`
    )
    .all(event_id, event_id);

  const insert = db.prepare(`INSERT INTO notifications (user_id, event_id, message, type) VALUES (?, ?, ?, ?)`);
  const tx = db.transaction((rows) => rows.forEach((s) => insert.run(s.student_id, event_id, message, "Announcement")));
  tx(students);

  res.status(201).json({ message: `Notification sent to ${students.length} student(s).` });
});

module.exports = router;
