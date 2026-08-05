import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";

export default function ManageEvent() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [regs, setRegs] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("registrations");

  async function load() {
    try {
      const [ev, r, fb] = await Promise.all([
        api.getEvent(id),
        api.eventRegistrations(id),
        api.eventFeedback(id).catch(() => []),
      ]);
      setEvent(ev);
      setRegs(r);
      setFeedback(fb);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function setStatus(regId, status) {
    setBusy(true);
    try {
      await api.setRegistrationStatus(regId, { status });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function markAttendance(regId, attendance_status) {
    setBusy(true);
    try {
      await api.setRegistrationStatus(regId, { attendance_status });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      const res = await api.broadcastNotification({ event_id: Number(id), message });
      setSuccess(res.message);
      setMessage("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!event || !regs) return <div className="spinner-text">{error || "Loading…"}</div>;

  const avgRating = feedback.length ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1) : null;

  return (
    <div>
      <Link to="/organiser" className="btn btn-outline btn-sm" style={{ marginBottom: 20, display: "inline-block" }}>← All events</Link>

      <div className="page-head">
        <div>
          <div className="eyebrow">{event.category}</div>
          <h1>{event.name}</h1>
          <p>{event.date} · {event.time} · {event.venue?.name || "TBA"}</p>
        </div>
        <span className={`status-pill ${event.status.toLowerCase()}`}>{event.status}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-block"><div className="num">{event.confirmedCount}/{event.capacity}</div><div className="label">Confirmed</div></div>
        <div className="stat-block"><div className="num">{event.waitlistCount}</div><div className="label">Waitlisted</div></div>
        <div className="stat-block"><div className="num">{avgRating ?? "—"}</div><div className="label">Avg rating</div></div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="tab-row">
        <button className={`tab-btn ${tab === "registrations" ? "active" : ""}`} onClick={() => setTab("registrations")}>Registrations</button>
        <button className={`tab-btn ${tab === "waitlist" ? "active" : ""}`} onClick={() => setTab("waitlist")}>Waitlist</button>
        <button className={`tab-btn ${tab === "notify" ? "active" : ""}`} onClick={() => setTab("notify")}>Send notice</button>
        <button className={`tab-btn ${tab === "feedback" ? "active" : ""}`} onClick={() => setTab("feedback")}>Feedback</button>
      </div>

      {tab === "registrations" && (
        <div className="card" style={{ overflowX: "auto" }}>
          {regs.registrations.length === 0 ? <p>No registrations yet.</p> : (
            <table>
              <thead><tr><th>Student</th><th>Roll No.</th><th>Status</th><th>Attendance</th><th></th></tr></thead>
              <tbody>
                {regs.registrations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.student_name}<br /><span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>{r.email}</span></td>
                    <td>{r.roll_no || "—"}</td>
                    <td><span className={`status-pill ${r.status.toLowerCase()}`}>{r.status}</span></td>
                    <td>
                      <select value={r.attendance_status} disabled={busy} onChange={(e) => markAttendance(r.id, e.target.value)}>
                        <option>Not Marked</option>
                        <option>Present</option>
                        <option>Absent</option>
                      </select>
                    </td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {r.status === "Pending" && (
                        <>
                          <button className="btn btn-sm" disabled={busy} onClick={() => setStatus(r.id, "Confirmed")}>Approve</button>
                          <button className="btn btn-clay btn-sm" disabled={busy} onClick={() => setStatus(r.id, "Rejected")}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "waitlist" && (
        <div className="card" style={{ overflowX: "auto" }}>
          {regs.waitlist.length === 0 ? <p>No one on the waitlist.</p> : (
            <table>
              <thead><tr><th>Student</th><th>Joined</th></tr></thead>
              <tbody>
                {regs.waitlist.map((w) => (
                  <tr key={w.id}><td>{w.student_name}<br /><span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>{w.email}</span></td><td>{new Date(w.joined_date).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ marginTop: 12, fontSize: "0.82rem" }}>Waitlisted students are auto-promoted when a confirmed registration is cancelled.</p>
        </div>
      )}

      {tab === "notify" && (
        <form className="card" onSubmit={sendBroadcast}>
          <h3>Send a custom announcement</h3>
          <p>Delivered to every confirmed and waitlisted student for this event.</p>
          <div className="field">
            <label>Message</label>
            <textarea rows={3} required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <button className="btn btn-amber" type="submit" disabled={busy}>Send notice</button>
        </form>
      )}

      {tab === "feedback" && (
        <div className="card">
          {feedback.length === 0 ? <p>No feedback submitted yet.</p> : (
            feedback.map((f) => (
              <div key={f.id} className="notif-item">
                <div>
                  <strong>{f.student_name}</strong> — {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                  <p style={{ margin: "4px 0 0" }}>{f.comments}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
