import { useEffect, useState } from "react";
import { api } from "../api/client";
import EventCard from "../components/EventCard";

export default function EventsBrowse() {
  const [events, setEvents] = useState(null);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const params = {};
      if (category) params.category = category;
      if (q) params.q = q;
      const data = await api.listEvents(params);
      setEvents(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    load();
  }

  const categories = ["Technical", "Cultural", "Sports", "Workshop", "Seminar"];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Notice board</div>
          <h1>Upcoming Events</h1>
          <p>Browse what's on across campus and register in a couple of clicks.</p>
        </div>
      </div>

      <form className="filters" onSubmit={handleFilter}>
        <input placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180, padding: "10px 12px", border: "1.5px solid var(--line-strong)", borderRadius: 3, fontFamily: "var(--font-body)" }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: "10px 12px", border: "1.5px solid var(--line-strong)", borderRadius: 3, fontFamily: "var(--font-body)" }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-sm" type="submit">Filter</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {!events ? (
        <div className="spinner-text">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <h3>No events match your search</h3>
          <p>Try clearing filters or check back soon — new events are added regularly.</p>
        </div>
      ) : (
        <div className="board" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {events.map((ev) => <EventCard key={ev.id} event={ev} />)}
        </div>
      )}
    </div>
  );
}
