require("dotenv").config();
const express = require("express");
const cors = require("cors");

require("./db"); // initializes schema + seed data on first run

const authRoutes = require("./routes/auth");
const eventRoutes = require("./routes/events");
const registrationRoutes = require("./routes/registrations");
const feedbackRoutes = require("./routes/feedback");
const notificationRoutes = require("./routes/notifications");
const venueRoutes = require("./routes/venues");
const resourceRoutes = require("./routes/resources");
const userRoutes = require("./routes/users");
const analyticsRoutes = require("./routes/analytics");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "CEMS API" }));

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/venues", venueRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/users", userRoutes);
app.use("/api/analytics", analyticsRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`CEMS backend running at http://localhost:${PORT}`);
});
