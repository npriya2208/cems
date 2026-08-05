const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/analytics/organiser  (Use Case: "View Analytics and Reports" - own events only)
router.get("/organiser", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const events = db.prepare("SELECT * FROM events WHERE organiser_id = ?").all(req.user.id);

  const perEvent = events.map((e) => {
    const confirmed = db.prepare("SELECT COUNT(*) c FROM registrations WHERE event_id = ? AND status='Confirmed'").get(e.id).c;
    const waitlisted = db.prepare("SELECT COUNT(*) c FROM waitlist WHERE event_id = ? AND status='Waiting'").get(e.id).c;
    const avgRating = db.prepare("SELECT AVG(rating) a FROM feedback WHERE event_id = ?").get(e.id).a;
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      capacity: e.capacity,
      confirmed,
      waitlisted,
      utilisation: e.capacity ? Math.round((confirmed / e.capacity) * 100) : 0,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
    };
  });

  res.json({
    totalEvents: events.length,
    totalRegistrations: perEvent.reduce((s, e) => s + e.confirmed, 0),
    events: perEvent,
  });
});

// GET /api/analytics/admin  (Use Case: "View Analytics and Reports" - institution-wide, Administrator only)
router.get("/admin", authenticate, authorize("administrator"), (req, res) => {
  const totals = {
    users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
    students: db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
    organisers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='organiser'").get().c,
    events: db.prepare("SELECT COUNT(*) c FROM events WHERE status != 'Cancelled'").get().c,
    registrations: db.prepare("SELECT COUNT(*) c FROM registrations WHERE status='Confirmed'").get().c,
    waitlisted: db.prepare("SELECT COUNT(*) c FROM waitlist WHERE status='Waiting'").get().c,
  };

  const byCategory = db
    .prepare(
      `SELECT COALESCE(category,'Uncategorised') AS category, COUNT(*) AS eventCount
       FROM events WHERE status != 'Cancelled' GROUP BY category`
    )
    .all();

  const byDepartment = db
    .prepare(
      `SELECT COALESCE(u.department, 'Unspecified') AS department, COUNT(*) AS registrationCount
       FROM registrations r JOIN users u ON u.id = r.student_id
       WHERE r.status = 'Confirmed' GROUP BY u.department`
    )
    .all();

  const upcoming = db
    .prepare("SELECT id, name, date, time, category FROM events WHERE status='Scheduled' AND date >= date('now') ORDER BY date LIMIT 5")
    .all();

  res.json({ totals, byCategory, byDepartment, upcoming });
});

// GET /api/analytics/report.csv  (Report.exportCSV())
router.get("/report.csv", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const events =
    req.user.role === "administrator"
      ? db.prepare("SELECT * FROM events").all()
      : db.prepare("SELECT * FROM events WHERE organiser_id = ?").all(req.user.id);

  let csv = "Event Name,Category,Date,Time,Capacity,Confirmed,Waitlisted,Status\n";
  for (const e of events) {
    const confirmed = db.prepare("SELECT COUNT(*) c FROM registrations WHERE event_id=? AND status='Confirmed'").get(e.id).c;
    const waitlisted = db.prepare("SELECT COUNT(*) c FROM waitlist WHERE event_id=? AND status='Waiting'").get(e.id).c;
    csv += `"${e.name}","${e.category || ""}",${e.date},${e.time},${e.capacity},${confirmed},${waitlisted},${e.status}\n`;
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=cems_report.csv");
  res.send(csv);
});

module.exports = router;
