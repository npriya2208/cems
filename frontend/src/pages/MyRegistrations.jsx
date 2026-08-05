import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function MyRegistrations() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      setData(await api.myRegistrations());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCancel(id) {
    setBusyId(id);
    try {
      await api.cancelRegistration(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!data) return <div className="spinner-text">{error || "Loading…"}</div>;

  return (
    <div>
      <div className="eyebrow">Your status</div>
      <h1>My Registrations</h1>
      <p style={{ marginBottom: 24 }}>Track confirmations, waitlist positions, and upcoming events.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <h3>Confirmed & Past</h3>
      {data.registrations.length === 0 ? (
        <p>You haven't registered for any events yet. <Link to="/events">Browse events →</Link></p>
      ) : (
        <div className="card" style={{ marginBottom: 28, overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Event</th><th>Date</th><th>Status</th><th>Attendance</th><th></th></tr>
            </thead>
            <tbody>
              {data.registrations.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/events/${r.event_id}`}>{r.event_name}</Link></td>
                  <td>{r.date} · {r.time}</td>
                  <td><span className={`status-pill ${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td>{r.attendance_status}</td>
                  <td>
                    {r.status === "Confirmed" && (
                      <button className="btn btn-outline btn-sm" disabled={busyId === r.id} onClick={() => handleCancel(r.id)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Waitlisted</h3>
      {data.waitlist.length === 0 ? (
        <p>You're not on any waitlists right now.</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Event</th><th>Date</th><th>Joined waitlist</th></tr></thead>
            <tbody>
              {data.waitlist.map((w) => (
                <tr key={w.id}>
                  <td><Link to={`/events/${w.event_id}`}>{w.event_name}</Link></td>
                  <td>{w.date} · {w.time}</td>
                  <td>{new Date(w.joined_date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
