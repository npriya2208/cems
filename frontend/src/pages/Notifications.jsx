import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Notifications() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(await api.myNotifications());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function markRead(id) {
    try {
      await api.markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="eyebrow">Alerts</div>
      <h1>Notifications</h1>
      <p style={{ marginBottom: 24 }}>Confirmations, reminders, and updates from event organisers.</p>

      {error && <div className="alert alert-error">{error}</div>}

      {!items ? (
        <div className="spinner-text">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state"><h3>All caught up</h3><p>You have no notifications yet.</p></div>
      ) : (
        <div className="card">
          {items.map((n) => (
            <div key={n.id} className={`notif-item ${n.is_read ? "read" : ""}`}>
              <span className="notif-dot" />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong style={{ fontSize: "0.82rem" }}>{n.type}</strong>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                    {new Date(n.sent_date).toLocaleString()}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0" }}>{n.message}</p>
              </div>
              {!n.is_read && (
                <button className="btn btn-outline btn-sm" onClick={() => markRead(n.id)}>Mark read</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
