const express = require("express");
const db = require("../db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

function toPublicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// GET /api/users  (Use Case: "Manage Users and Roles" - Administrator only)
router.get("/", authenticate, authorize("administrator"), (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY role, name").all();
  res.json(users.map(toPublicUser));
});

// PUT /api/users/:id/role  (change a user's role)
router.put("/:id/role", authenticate, authorize("administrator"), (req, res) => {
  const { role } = req.body;
  if (!["student", "organiser", "administrator"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
  res.json(toPublicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)));
});

// DELETE /api/users/:id
router.delete("/:id", authenticate, authorize("administrator"), (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.id === req.user.id) return res.status(400).json({ error: "You cannot remove your own account." });
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  res.json({ message: "User removed." });
});

module.exports = router;
