const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/venues
router.get("/", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM venues ORDER BY name").all());
});

// POST /api/venues  (admin/organiser can add venues)
router.post("/", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const { name, location, capacity } = req.body;
  if (!name || !capacity) return res.status(400).json({ error: "name and capacity are required." });
  const info = db.prepare("INSERT INTO venues (name, location, capacity) VALUES (?, ?, ?)").run(name, location || null, capacity);
  res.status(201).json(db.prepare("SELECT * FROM venues WHERE id = ?").get(info.lastInsertRowid));
});

// GET /api/venues/:id/availability?date=&time=  (Class Diagram: Venue.checkAvailability())
router.get("/:id/availability", authenticate, (req, res) => {
  const { date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: "date and time query params are required." });
  const conflict = db
    .prepare("SELECT * FROM events WHERE venue_id = ? AND date = ? AND time = ? AND status != 'Cancelled'")
    .get(req.params.id, date, time);
  res.json({ available: !conflict, conflictingEvent: conflict || null });
});

module.exports = router;
