const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// POST /api/feedback  (Use Case: "Give Feedback")
router.post("/", authenticate, authorize("student"), (req, res) => {
  const { event_id, rating, comments } = req.body;
  if (!event_id || !rating) return res.status(400).json({ error: "event_id and rating are required." });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: "rating must be between 1 and 5." });

  const attended = db
    .prepare("SELECT * FROM registrations WHERE student_id = ? AND event_id = ? AND status = 'Confirmed'")
    .get(req.user.id, event_id);
  if (!attended) return res.status(403).json({ error: "You can only give feedback for events you registered for." });

  const existing = db.prepare("SELECT * FROM feedback WHERE student_id = ? AND event_id = ?").get(req.user.id, event_id);
  if (existing) {
    db.prepare("UPDATE feedback SET rating = ?, comments = ? WHERE id = ?").run(rating, comments || null, existing.id);
    return res.json(db.prepare("SELECT * FROM feedback WHERE id = ?").get(existing.id));
  }

  const info = db
    .prepare("INSERT INTO feedback (student_id, event_id, rating, comments) VALUES (?, ?, ?, ?)")
    .run(req.user.id, event_id, rating, comments || null);
  res.status(201).json(db.prepare("SELECT * FROM feedback WHERE id = ?").get(info.lastInsertRowid));
});

// GET /api/feedback/event/:eventId  (organiser/admin view of feedback for an event)
router.get("/event/:eventId", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, u.name AS student_name FROM feedback f JOIN users u ON u.id = f.student_id WHERE f.event_id = ?`
    )
    .all(req.params.eventId);
  res.json(rows);
});

module.exports = router;
