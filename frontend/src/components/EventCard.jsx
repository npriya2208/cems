import { Link } from "react-router-dom";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function EventCard({ event }) {
  const isFull = event.seatsRemaining <= 0;
  return (
    <article className="event-card">
      <span className="event-card-tag">{event.category || "General"}</span>
      <h3>
        <Link to={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          {event.name}
        </Link>
      </h3>
      <p style={{ fontSize: "0.88rem" }}>{event.description}</p>
      <div className="event-meta">
        <span>📅 {formatDate(event.date)} · {event.time}</span>
        <span>📍 {event.venue?.name || "Venue TBA"}</span>
      </div>
      <div className="event-card-footer">
        <span className="status-pill scheduled">
          {isFull ? `Waitlist open` : `${event.seatsRemaining} seat${event.seatsRemaining === 1 ? "" : "s"} left`}
        </span>
        <Link to={`/events/${event.id}`} className="btn btn-sm">
          View
        </Link>
      </div>
    </article>
  );
}
