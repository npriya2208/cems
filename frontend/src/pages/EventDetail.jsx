import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [myStatus, setMyStatus] = useState(null); // 'Confirmed' | 'Waiting' | null
  const [rating, setRating] = useState(5);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const ev = await api.getEvent(id);
      setEvent(ev);
      if (user?.role === "student") {
        const mine = await api.myRegistrations();
        const reg = mine.registrations.find((r) => r.event_id === Number(id) && r.status === "Confirmed");
        const wl = mine.waitlist.find((w) => w.event_id === Number(id));
        setMyStatus(reg ? "Confirmed" : wl ? "Waiting" : null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRegister() {
    setError(""); setSuccess(""); setBusy(true);
    try {
      const res = await api.registerForEvent(Number(id));
      setSuccess(res.type === "waitlist" ? "Event is full — you've been added to the waitlist." : "You're registered! Confirmation sent.");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFeedback(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      await api.giveFeedback({ event_id: Number(id), rating: Number(rating), comments });
      setSuccess("Thanks — your feedback was submitted.");
      setComments("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!event) return <div className="spinner-text">{error || "Loading event…"}</div>;

  const isPast = new Date(event.date) < new Date(new Date().toDateString());

  return (
    <div>
      <button className="btn btn-outline btn-sm" style={{ marginBottom: 20 }} onClick={() => navigate(-1)}>← Back</button>

      <div className="card" style={{ marginBottom: 20 }}>
        <span className="event-card-tag">{event.category || "General"}</span>
        <h1>{event.name}</h1>
        <p>{event.description}</p>

        <div className="event-meta" style={{ marginTop: 16 }}>
          <span>📅 {formatDate(event.date)} · {event.time}</span>
          <span>📍 {event.venue?.name || "TBA"} {event.venue?.location ? `(${event.venue.location})` : ""}</span>
          <span>👥 Capacity {event.capacity} · {event.confirmedCount} confirmed · {event.waitlistCount} waitlisted</span>
          <span>Status: <span className={`status-pill ${event.status.toLowerCase()}`}>{event.status}</span></span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {user?.role === "student" && event.status === "Scheduled" && !isPast && (
          <>
            {myStatus === "Confirmed" && <div className="alert alert-success">You're registered for this event.</div>}
            {myStatus === "Waiting" && <div className="alert alert-error" style={{ background: "#fdecd6", borderColor: "var(--amber)", color: "var(--amber-deep)" }}>You're on the waitlist.</div>}
            {!myStatus && (
              <button className="btn btn-amber" onClick={handleRegister} disabled={busy}>
                {event.seatsRemaining > 0 ? "Register for this event" : "Join waitlist"}
              </button>
            )}
          </>
        )}

        {!user && <p style={{ marginTop: 12 }}><a href="/login">Log in</a> as a student to register.</p>}
      </div>

      {user?.role === "student" && myStatus === "Confirmed" && (isPast || event.status === "Completed") && (
        <div className="card">
          <h3>Give feedback</h3>
          <p>How was your experience at this event?</p>
          <form onSubmit={handleFeedback}>
            <div className="field">
              <label>Rating (1–5)</label>
              <select value={rating} onChange={(e) => setRating(e.target.value)}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {"★".repeat(n)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Comments</label>
              <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>
            <button className="btn btn-amber" type="submit" disabled={busy}>Submit feedback</button>
          </form>
        </div>
      )}
    </div>
  );
}
