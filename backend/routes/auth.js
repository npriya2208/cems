const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { JWT_SECRET, authenticate } = require("../middleware/auth");

const router = express.Router();

function toPublicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// POST /api/auth/register  (Use Case: "Register on Portal")
router.post("/register", (req, res) => {
  const { name, email, password, role, department, roll_no, contact_no } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, and role are required." });
  }
  if (!["student", "organiser", "administrator"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with this email already exists." });

  const hashed = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (name, email, password, role, department, roll_no, contact_no)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, email, hashed, role, department || null, roll_no || null, contact_no || null);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.status(201).json({ token, user: toPublicUser(user) });
});

// POST /api/auth/login  (Use Case: "Login" - included by nearly every other use case)
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token, user: toPublicUser(user) });
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(toPublicUser(user));
});

module.exports = router;
