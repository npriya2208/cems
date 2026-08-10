import { api, getToken, escapeHtml } from '../api.js';

export default {
  async render(container) {
    let data     = null;
    let errorMsg = '';

    const renderDOM = () => {
      if (!data) {
        container.innerHTML = errorMsg
          ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>`
          : '<div class="spinner-text">Loading…</div>';
        return;
      }

      container.innerHTML = `
        <div>
          <div class="page-head">
            <div>
              <div class="eyebrow">Organiser</div>
              <h1>Analytics &amp; Reports</h1>
              <p>Performance metrics for all your hosted events.</p>
            </div>
            <button class="btn btn-outline" id="dl-csv-btn">⬇ Download CSV Report</button>
          </div>

          ${errorMsg ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>` : ''}

          <div class="stat-grid" style="margin-bottom: 24px">
            <div class="stat-block"><div class="num">${data.totalEvents}</div><div class="label">Total events</div></div>
            <div class="stat-block"><div class="num">${data.totalRegistrations}</div><div class="label">Total registrations</div></div>
          </div>

          ${data.events.length === 0
            ? `<div class="empty-state">
                 <h3>No events yet</h3>
                 <p>Analytics will appear here once you've created and published events.</p>
               </div>`
            : `<div class="card" style="overflow-x: auto;">
                <table>
                  <thead>
                    <tr>
                      <th>Event Name</th><th>Date</th><th>Confirmed / Cap.</th>
                      <th>Utilisation</th><th>Waitlist</th><th>Avg Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.events.map(e => `
                      <tr>
                        <td><a href="#/organiser/events/${e.id}">${escapeHtml(e.name)}</a></td>
                        <td>${escapeHtml(e.date)}</td>
                        <td>${e.confirmed} / ${e.capacity}</td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="flex:1; height:6px; background:var(--line-light); border-radius:3px; overflow:hidden; min-width: 60px;">
                              <div style="height:100%; background:var(--amber); width:${Math.min(e.utilisation, 100)}%;"></div>
                            </div>
                            <span style="font-size:0.75rem; min-width:3ch">${e.utilisation}%</span>
                          </div>
                        </td>
                        <td>${e.waitlisted}</td>
                        <td>${e.avgRating ? `${e.avgRating} ★` : '—'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`
          }
        </div>
      `;

      document.getElementById('dl-csv-btn').addEventListener('click', async () => {
        const btn = document.getElementById('dl-csv-btn');
        btn.disabled  = true;
        btn.innerText = 'Downloading…';
        try {
          const res = await fetch(api.reportCsvUrl(), {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (!res.ok) throw new Error('Download failed.');
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href     = url;
          a.download = 'cems_organiser_report.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e) {
          errorMsg = e.message || 'Download failed.';
          renderDOM();
        } finally {
          if (btn) {
            btn.disabled  = false;
            btn.innerText = '⬇ Download CSV Report';
          }
        }
      });
    };

    const load = async () => {
      try {
        data     = await api.organiserAnalytics();
        errorMsg = '';
      } catch (err) {
        errorMsg = err.message;
      }
      renderDOM();
    };

    renderDOM();
    await load();
  }
};
