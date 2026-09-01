import { useEffect, useState } from "react";
import { api, getToken } from "../api/client";

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.organiserAnalytics().then(setData).catch((e) => setError(e.message));
  }, []);

  async function downloadCsv() {
    try {
      const res = await fetch(api.reportCsvUrl(), { headers: { Authorization: `Bearer ${getToken()}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cems_report.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Could not download report.");
    }
  }

  if (!data) return <div className="spinner-text">{error || "Loading…"}</div>;

  return (
    <div>
      <div className="eyebrow">Insights</div>
      <h1>Your Event Analytics</h1>
      <p style={{ marginBottom: 20 }}>Live registration and attendance figures for the events you organise.</p>

      <div className="stat-grid">
        <div className="stat-block"><div className="num">{data.totalEvents}</div><div className="label">Events</div></div>
        <div className="stat-block"><div className="num">{data.totalRegistrations}</div><div className="label">Total registrations</div></div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Event</th><th>Date</th><th>Confirmed / Capacity</th><th>Utilisation</th><th>Waitlisted</th><th>Avg Rating</th></tr></thead>
          <tbody>
            {data.events.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.date}</td>
                <td>{e.confirmed} / {e.capacity}</td>
                <td>{e.utilisation}%</td>
                <td>{e.waitlisted}</td>
                <td>{e.avgRating ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={downloadCsv}>
        Download CSV report
      </button>
    </div>
  );
}
