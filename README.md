# CEMS — College Event Management System

## Live Demo
🚀 **[Click here to open CEMS Live App](https://cems-bay.vercel.app/)**

A full-stack web application implementing the **College Event Management System (CEMS)**
designed across four Software Engineering lab experiments:

1. **SRS** — functional & non-functional requirements
2. **Use Case Diagram** — Student / Organiser / Administrator actors and use cases
3. **Class & Object Diagram** — the entity model (User → Student/Organiser/Administrator, Event, Registration, Venue, Resource, Notification, Waitlist, Feedback, Report)
4. **Sequence & Collaboration Diagram** — the event registration message flow

Every feature below traces back to a requirement or use case from those documents.

---

## Project structure

```
cems/
├── backend/                   Node.js + Express REST API
│   ├── server.js              App entry point
│   ├── db.js                  SQLite schema + seed data (better-sqlite3)
│   ├── middleware/
│   │   └── auth.js            JWT authentication + role-based access control (RBAC)
│   ├── routes/
│   │   ├── auth.js            Register / Login / Me
│   │   ├── events.js          Create/edit/cancel events, venue-conflict detection
│   │   ├── registrations.js   Register, waitlist, cancel, approve, mark attendance
│   │   ├── feedback.js        Submit / view event feedback
│   │   ├── notifications.js   Personal notifications + organiser broadcasts
│   │   ├── venues.js          Venue list + availability check
│   │   ├── resources.js       Resource list (projectors, mics, laptops, etc.)
│   │   ├── users.js           Admin: manage users & roles
│   │   └── analytics.js       Organiser & institution-wide analytics, CSV export
│   └── package.json
│
├── frontend/                  React 18 + Vite SPA
│   └── src/
│       ├── api/client.js      Typed fetch wrapper for every backend endpoint
│       ├── context/AuthContext.jsx
│       ├── components/        Navbar, EventCard, ProtectedRoute
│       ├── pages/
│       │   ├── Login.jsx / Register.jsx
│       │   ├── EventsBrowse.jsx / EventDetail.jsx        (Student)
│       │   ├── MyRegistrations.jsx / Notifications.jsx   (Student)
│       │   ├── OrganiserDashboard.jsx / ManageEvent.jsx  (Organiser)
│       │   ├── Analytics.jsx                             (Organiser)
│       │   └── AdminDashboard.jsx / ManageUsers.jsx       (Administrator)
│       ├── styles/index.css   Design system (custom "notice board" theme)
│       └── App.jsx            Routes
│
└── README.md                  You are here
```

---

## How the app maps to your experiments

| Experiment | What it produced | Where it lives in this app |
|---|---|---|
| Exp 1 — SRS | Functional & non-functional requirements | Drives the entire feature set: capacity limits, waitlists, RBAC, notifications, analytics, CSV export |
| Exp 2 — Use Case Diagram | Student / Organiser / Administrator + 11 use cases | Each use case is a real route + UI page (see table below) |
| Exp 3 — Class/Object Diagram | User hierarchy, Event, Registration, Venue, Resource, Notification, Waitlist, Feedback, Report | Directly mirrored as SQLite tables in `backend/db.js` |
| Exp 4 — Sequence/Collaboration Diagram | Student → Login → Browse → Register → Validate → Store → Notify | Implemented exactly in `POST /api/registrations` |

### Use cases → implementation

| Use case (Exp 2) | Endpoint(s) | Page |
|---|---|---|
| Register on Portal | `POST /api/auth/register` | Register.jsx |
| Login | `POST /api/auth/login` | Login.jsx |
| Browse and Register for Event | `GET /api/events`, `POST /api/registrations` | EventsBrowse.jsx, EventDetail.jsx |
| Join Waitlist («extend») | auto-triggered inside `POST /api/registrations` when full | EventDetail.jsx |
| View Registration Status | `GET /api/registrations/mine` | MyRegistrations.jsx |
| Give Feedback | `POST /api/feedback` | EventDetail.jsx |
| Create and Manage Event | `POST/PUT/DELETE /api/events` | OrganiserDashboard.jsx |
| Approve Registrations and Allocate Resources | `PUT /api/registrations/:id/status`, `event_resources` table | ManageEvent.jsx |
| Send Notifications and Alerts | `POST /api/notifications/broadcast` | ManageEvent.jsx |
| View Analytics and Reports | `GET /api/analytics/organiser`, `/admin` | Analytics.jsx, AdminDashboard.jsx |
| Manage Users and Roles | `GET/PUT/DELETE /api/users` | ManageUsers.jsx |

---

## Running it locally

You'll need **Node.js 18+** installed.

### 1. Backend

```bash
cd backend
npm install
npm start
```

Runs on **http://localhost:4000**. On first run it automatically creates `cems.db`
(SQLite file) and seeds it with 3 demo accounts, 3 venues, 3 resources, and 3 events.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5173** and proxies `/api/*` requests to the backend
(see `vite.config.js`), so both servers just need to be running side by side.

Open **http://localhost:5173** in your browser.

### Demo accounts (password for all: `password123`)

| Role | Email |
|---|---|
| Student | `student@cems.edu` |
| Organiser | `organiser@cems.edu` |
| Administrator | `admin@cems.edu` |

You can also register new accounts of any role from the **Register** page.

---

## Key behaviors implemented from the SRS

- **Capacity & waitlist (SRS 4.1.3):** registering for a full event automatically places the student on a waitlist; cancelling a confirmed registration auto-promotes the earliest waitlisted student and notifies them.
- **Venue conflict detection (SRS 4.1.2):** creating/editing an event at a venue that's already booked for that date & time is rejected with a clear error.
- **Notifications (SRS 4.2):** automatic notifications are created on registration confirmation, waitlisting, promotion, schedule changes, cancellations, and status updates; organisers can also send custom announcements to all registrants of an event.
- **RBAC (SRS 5.3):** every write endpoint is protected by role middleware — students can't create events, organisers can only manage their own events, only administrators can manage users/roles.
- **Analytics & reporting (SRS 4.3):** live registration counts, capacity utilisation, average feedback ratings, and CSV export, scoped to an organiser's own events or institution-wide for administrators.
- **Passwords are hashed with bcrypt**; sessions use JWTs (SRS 5.3 "resilient against unauthorised access").

## Notes / things you could extend

- The backend uses SQLite for simplicity — swapping to PostgreSQL/MySQL (as the SRS's operating environment section specifies) just means changing `db.js` to a different driver; the SQL is close to standard.
- Email/SMS delivery isn't wired up — notifications are stored and shown in-app (`/notifications`), which is where you'd hook in an SMTP/SMS provider per SRS 3.4.
- The design is a custom "campus notice board" theme (serif display type, pinned event cards, ticket-style status pills) rather than a generic template.
