import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getToken } from "../api/client";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.adminAnalytics().then(setData).catch((e) => setError(e.message));
  }, []);

  async function downloadCsv() {
    const res = await fetch(api.reportCsvUrl(), { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cems_institution_report.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (!data) return <div className="spinner-text">{error || "Loading…"}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Institution-Wide Analytics</h1>
          <p>Oversight across all events, departments, and users.</p>
        </div>
        <Link to="/admin/users" className="btn btn-outline">Manage Users & Roles</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <div className="stat-block"><div className="num">{data.totals.students}</div><div className="label">Students</div></div>
        <div className="stat-block"><div className="num">{data.totals.organisers}</div><div className="label">Organisers</div></div>
        <div className="stat-block"><div className="num">{data.totals.events}</div><div className="label">Active events</div></div>
        <div className="stat-block"><div className="num">{data.totals.registrations}</div><div className="label">Confirmed regs.</div></div>
        <div className="stat-block"><div className="num">{data.totals.waitlisted}</div><div className="label">Waitlisted</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <h3>Events by category</h3>
          <table>
            <thead><tr><th>Category</th><th>Events</th></tr></thead>
            <tbody>
              {data.byCategory.map((c) => <tr key={c.category}><td>{c.category}</td><td>{c.eventCount}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Registrations by department</h3>
          <table>
            <thead><tr><th>Department</th><th>Registrations</th></tr></thead>
            <tbody>
              {data.byDepartment.map((d) => <tr key={d.department}><td>{d.department}</td><td>{d.registrationCount}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Upcoming events</h3>
        {data.upcoming.length === 0 ? <p>Nothing scheduled right now.</p> : (
          <table>
            <thead><tr><th>Event</th><th>Category</th><th>Date</th></tr></thead>
            <tbody>
              {data.upcoming.map((e) => (
                <tr key={e.id}><td><Link to={`/events/${e.id}`}>{e.name}</Link></td><td>{e.category}</td><td>{e.date} · {e.time}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={downloadCsv}>Download full CSV report</button>
    </div>
  );
}
