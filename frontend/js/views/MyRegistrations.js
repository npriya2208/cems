import { api, escapeHtml } from '../api.js';

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

      const renderRegRow = (r) => `
        <tr>
          <td><a href="#/events/${r.event_id}">${escapeHtml(r.event_name)}</a></td>
          <td>${escapeHtml(r.date)} · ${escapeHtml(r.time)}</td>
          <td><span class="status-pill ${escapeHtml(r.status.toLowerCase())}">${escapeHtml(r.status)}</span></td>
          <td>${escapeHtml(r.attendance_status || 'Not Marked')}</td>
          <td>
            ${r.status === 'Confirmed'
              ? `<button class="btn btn-outline btn-sm cancel-btn" data-id="${r.id}">Cancel</button>`
              : ''}
          </td>
        </tr>
      `;

      const renderWaitlistRow = (w) => `
        <tr>
          <td><a href="#/events/${w.event_id}">${escapeHtml(w.event_name)}</a></td>
          <td>${escapeHtml(w.date)} · ${escapeHtml(w.time)}</td>
          <td>${new Date(w.joined_date).toLocaleDateString()}</td>
        </tr>
      `;

      container.innerHTML = `
        <div>
          <div class="eyebrow">Your status</div>
          <h1>My Registrations</h1>
          <p style="margin-bottom: 24px">Track confirmations, waitlist positions, and upcoming events.</p>

          ${errorMsg ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>` : ''}

          <h3>Confirmed &amp; Past</h3>
          ${data.registrations.length === 0
            ? `<p>You haven't registered for any events yet. <a href="#/events">Browse events →</a></p>`
            : `<div class="card" style="margin-bottom: 28px; overflow-x: auto;">
                <table>
                  <thead>
                    <tr><th>Event</th><th>Date</th><th>Status</th><th>Attendance</th><th></th></tr>
                  </thead>
                  <tbody>${data.registrations.map(renderRegRow).join('')}</tbody>
                </table>
              </div>`
          }

          <h3>Waitlisted</h3>
          ${data.waitlist.length === 0
            ? `<p>You're not on any waitlists right now.</p>`
            : `<div class="card" style="overflow-x: auto;">
                <table>
                  <thead><tr><th>Event</th><th>Date</th><th>Joined waitlist</th></tr></thead>
                  <tbody>${data.waitlist.map(renderWaitlistRow).join('')}</tbody>
                </table>
              </div>`
          }
        </div>
      `;

      document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Cancel this registration?')) return;
          btn.disabled  = true;
          btn.innerText = 'Cancelling…';
          try {
            await api.cancelRegistration(id);
            errorMsg = '';
            await load();
          } catch (err) {
            errorMsg = err.message;
            renderDOM();
          }
        });
      });
    };

    const load = async () => {
      try {
        data     = await api.myRegistrations();
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
