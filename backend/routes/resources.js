const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/resources
router.get("/", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM resources ORDER BY name").all());
});

// POST /api/resources
router.post("/", authenticate, authorize("organiser", "administrator"), (req, res) => {
  const { name, quantity, description } = req.body;
  if (!name || quantity == null) return res.status(400).json({ error: "name and quantity are required." });
  const info = db
    .prepare("INSERT INTO resources (name, quantity, description) VALUES (?, ?, ?)")
    .run(name, quantity, description || null);
  res.status(201).json(db.prepare("SELECT * FROM resources WHERE id = ?").get(info.lastInsertRowid));
});

module.exports = router;
