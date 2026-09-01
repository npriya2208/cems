import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const emptyForm = { name: "", category: "Technical", description: "", date: "", time: "", venue_id: "", capacity: 50 };

export default function OrganiserDashboard() {
  const [events, setEvents] = useState(null);
  const [venues, setVenues] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const [ev, vn] = await Promise.all([api.myOrganisedEvents(), api.listVenues()]);
      setEvents(ev);
      setVenues(vn);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      await api.createEvent({ ...form, venue_id: form.venue_id ? Number(form.venue_id) : null, capacity: Number(form.capacity) });
      setSuccess(`"${form.name}" was created and published.`);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelEvent(id, name) {
    if (!confirm(`Cancel "${name}"? Registered students will be notified.`)) return;
    try {
      await api.cancelEvent(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Organiser</div>
          <h1>Manage Your Events</h1>
          <p>Create events, allocate venues, and track registrations.</p>
        </div>
        <button className="btn btn-amber" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close form" : "+ New event"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate} style={{ marginBottom: 28 }}>
          <h3>New event</h3>
          <div className="field">
            <label>Event name</label>
            <input required value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => update("category", e.target.value)}>
                {["Technical", "Cultural", "Sports", "Workshop", "Seminar"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Capacity</label>
              <input type="number" min={1} required value={form.capacity} onChange={(e) => update("capacity", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => update("description", e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Date</label>
              <input type="date" required value={form.date} onChange={(e) => update("date", e.target.value)} />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" required value={form.time} onChange={(e) => update("time", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Venue (conflicts are checked automatically)</label>
            <select value={form.venue_id} onChange={(e) => update("venue_id", e.target.value)}>
              <option value="">No venue / TBA</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.location} (cap. {v.capacity})</option>)}
            </select>
          </div>
          <button className="btn btn-amber" type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish event"}</button>
        </form>
      )}

      {!events ? (
        <div className="spinner-text">Loading…</div>
      ) : events.length === 0 ? (
        <div className="empty-state"><h3>No events yet</h3><p>Create your first event to get started.</p></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Event</th><th>Date</th><th>Venue</th><th>Registered</th><th>Waitlist</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/organiser/events/${e.id}`}>{e.name}</Link></td>
                  <td>{e.date} · {e.time}</td>
                  <td>{e.venue?.name || "—"}</td>
                  <td>{e.confirmedCount} / {e.capacity}</td>
                  <td>{e.waitlistCount}</td>
                  <td><span className={`status-pill ${e.status.toLowerCase()}`}>{e.status}</span></td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Link to={`/organiser/events/${e.id}`} className="btn btn-outline btn-sm">Manage</Link>
                    {e.status === "Scheduled" && (
                      <button className="btn btn-clay btn-sm" onClick={() => handleCancelEvent(e.id, e.name)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
