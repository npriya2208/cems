import { api, getToken, escapeHtml } from '../api.js';

let _pollTimer = null;

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
              <div class="eyebrow">Administration</div>
              <h1>Institution-Wide Analytics</h1>
              <p>Oversight across all events, departments, and users.</p>
            </div>
            <a href="#/admin/users" class="btn btn-outline">Manage Users &amp; Roles</a>
          </div>

          ${errorMsg ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>` : ''}

          <div class="stat-grid">
            <div class="stat-block"><div class="num">${data.totals.students}</div><div class="label">Students</div></div>
            <div class="stat-block"><div class="num">${data.totals.organisers}</div><div class="label">Organisers</div></div>
            <div class="stat-block"><div class="num">${data.totals.events}</div><div class="label">Active events</div></div>
            <div class="stat-block"><div class="num">${data.totals.registrations}</div><div class="label">Confirmed regs.</div></div>
            <div class="stat-block"><div class="num">${data.totals.waitlisted}</div><div class="label">Waitlisted</div></div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; flex-wrap: wrap;">
            <div class="card">
              <h3>Events by category</h3>
              ${data.byCategory.length === 0
                ? '<p>No data yet.</p>'
                : `<table>
                    <thead><tr><th>Category</th><th>Events</th></tr></thead>
                    <tbody>
                      ${data.byCategory.map(c => `<tr><td>${escapeHtml(c.category)}</td><td>${c.eventCount}</td></tr>`).join('')}
                    </tbody>
                  </table>`
              }
            </div>
            <div class="card">
              <h3>Registrations by department</h3>
              ${data.byDepartment.length === 0
                ? '<p>No data yet.</p>'
                : `<table>
                    <thead><tr><th>Department</th><th>Registrations</th></tr></thead>
                    <tbody>
                      ${data.byDepartment.map(d => `<tr><td>${escapeHtml(d.department)}</td><td>${d.registrationCount}</td></tr>`).join('')}
                    </tbody>
                  </table>`
              }
            </div>
          </div>

          <div class="card" style="margin-top: 20px" id="pending-approvals-card">
            <h3>Events awaiting your approval ${data.pending.length ? `<span class="badge">${data.pending.length}</span>` : ''}</h3>
            ${data.pending.length === 0
              ? '<p>Nothing waiting on you right now.</p>'
              : `<table>
                  <thead><tr><th>Event</th><th>Organiser</th><th>Date</th><th>Capacity</th><th></th></tr></thead>
                  <tbody>
                    ${data.pending.map(e => `
                      <tr data-event-id="${e.id}">
                        <td>${escapeHtml(e.name)}</td>
                        <td>${escapeHtml(e.organiser_name)}<br><small style="color:#888">${escapeHtml(e.organiser_email)}</small></td>
                        <td>${escapeHtml(e.date)} · ${escapeHtml(e.time)}</td>
                        <td>${e.capacity}</td>
                        <td style="white-space:nowrap">
                          <button class="btn btn-sm btn-amber approve-btn" data-id="${e.id}">Approve</button>
                          <button class="btn btn-sm btn-outline reject-btn" data-id="${e.id}">Reject</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
            }
          </div>

          <div class="card" style="margin-top: 20px">
            <h3>Upcoming events</h3>
            ${data.upcoming.length === 0
              ? '<p>Nothing scheduled right now.</p>'
              : `<table>
                  <thead><tr><th>Event</th><th>Category</th><th>Date</th></tr></thead>
                  <tbody>
                    ${data.upcoming.map(e => `
                      <tr>
                        <td><a href="#/events/${e.id}">${escapeHtml(e.name)}</a></td>
                        <td>${escapeHtml(e.category)}</td>
                        <td>${escapeHtml(e.date)} · ${escapeHtml(e.time)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
            }
          </div>

          <button class="btn btn-outline btn-sm" style="margin-top: 16px" id="dl-csv-btn">
            ⬇ Download full CSV report
          </button>
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
          a.download = 'cems_institution_report.csv';
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
            btn.innerText = '⬇ Download full CSV report';
          }
        }
      });

      container.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          try {
            await api.approveEvent(id);
            await load();
          } catch (e) {
            errorMsg = e.message;
            renderDOM();
          }
        });
      });

      container.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const reason = window.prompt('Optional: reason for rejecting this event (shown to the organiser)');
          if (reason === null) return; // user cancelled the prompt
          btn.disabled = true;
          try {
            await api.rejectEvent(id, reason || undefined);
            await load();
          } catch (e) {
            errorMsg = e.message;
            renderDOM();
          }
        });
      });
    };

    const load = async () => {
      try {
        const [analytics, pending] = await Promise.all([
          api.adminAnalytics(),
          api.pendingApprovalEvents(),
        ]);
        data     = { ...analytics, pending };
        errorMsg = '';
      } catch (err) {
        errorMsg = err.message;
      }
      renderDOM();
    };

    // Keeps the pending-approval queue and stats current without a manual
    // reload if an organiser submits/cancels an event while this is open.
    const refreshQuietly = async () => {
      try {
        const [analytics, pending] = await Promise.all([
          api.adminAnalytics(),
          api.pendingApprovalEvents(),
        ]);
        const fresh = { ...analytics, pending };
        if (JSON.stringify(fresh) !== JSON.stringify(data)) {
          data = fresh;
          renderDOM();
        }
      } catch (err) {
        // Silent — a failed background refresh shouldn't interrupt the page.
      }
    };

    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(refreshQuietly, 15000);

    renderDOM();
    await load();
  },

  unmount() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }
};
