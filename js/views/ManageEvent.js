import { api, escapeHtml } from '../api.js';

export default {
  async render(container, params) {
    const id = params.id;
    let event    = null;
    let regs     = null;
    let feedback = [];
    let errorMsg  = '';
    let successMsg = '';
    let tab = 'registrations';

    const renderDOM = () => {
      if (!event || !regs) {
        container.innerHTML = errorMsg
          ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>`
          : '<div class="spinner-text">Loading…</div>';
        return;
      }

      const avgRating = feedback.length
        ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1)
        : null;

      container.innerHTML = `
        <div>
          <a href="#/organiser" class="btn btn-outline btn-sm" style="margin-bottom: 20px; display: inline-block;">← All events</a>

          <div class="page-head">
            <div>
              <div class="eyebrow">${escapeHtml(event.category)}</div>
              <h1>${escapeHtml(event.name)}</h1>
              <p>${escapeHtml(event.date)} · ${escapeHtml(event.time)} · ${escapeHtml(event.venue?.name || 'TBA')}</p>
            </div>
            <span class="status-pill ${escapeHtml(event.status.toLowerCase())}">${escapeHtml(event.status)}</span>
          </div>

          <div class="stat-grid">
            <div class="stat-block"><div class="num">${event.confirmedCount}/${event.capacity}</div><div class="label">Confirmed</div></div>
            <div class="stat-block"><div class="num">${event.waitlistCount}</div><div class="label">Waitlisted</div></div>
            <div class="stat-block"><div class="num">${avgRating ?? '—'}</div><div class="label">Avg rating</div></div>
          </div>

          <div id="me-error"   class="alert alert-error"   style="display:${errorMsg   ? 'block' : 'none'};">${escapeHtml(errorMsg)}</div>
          <div id="me-success" class="alert alert-success" style="display:${successMsg ? 'block' : 'none'};">${escapeHtml(successMsg)}</div>

          <div class="tab-row" role="tablist">
            <button class="tab-btn ${tab === 'registrations' ? 'active' : ''}" data-tab="registrations" role="tab" aria-selected="${tab === 'registrations'}">Registrations</button>
            <button class="tab-btn ${tab === 'waitlist'     ? 'active' : ''}" data-tab="waitlist"      role="tab" aria-selected="${tab === 'waitlist'}">Waitlist</button>
            <button class="tab-btn ${tab === 'notify'       ? 'active' : ''}" data-tab="notify"        role="tab" aria-selected="${tab === 'notify'}">Send notice</button>
            <button class="tab-btn ${tab === 'feedback'     ? 'active' : ''}" data-tab="feedback"      role="tab" aria-selected="${tab === 'feedback'}">Feedback</button>
          </div>

          <div id="tab-content" role="tabpanel"></div>
        </div>
      `;

      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          tab = btn.dataset.tab;
          errorMsg   = '';
          successMsg = '';
          renderDOM();
        });
      });

      const tabContent = document.getElementById('tab-content');

      if (tab === 'registrations') {
        tabContent.innerHTML = `
          <div class="card" style="overflow-x: auto;">
            ${regs.registrations.length === 0
              ? '<p>No registrations yet.</p>'
              : `<table>
                  <thead><tr><th>Student</th><th>Roll No.</th><th>Status</th><th>Attendance</th><th></th></tr></thead>
                  <tbody>
                    ${regs.registrations.map(r => `
                      <tr>
                        <td>
                          ${escapeHtml(r.student_name)}
                          <br/><span style="font-size:0.75rem;color:var(--ink-soft)">${escapeHtml(r.email)}</span>
                        </td>
                        <td>${escapeHtml(r.roll_no || '—')}</td>
                        <td><span class="status-pill ${escapeHtml(r.status.toLowerCase())}">${escapeHtml(r.status)}</span></td>
                        <td>
                          <select class="attendance-select" data-id="${r.id}">
                            <option ${r.attendance_status === 'Not Marked' ? 'selected' : ''}>Not Marked</option>
                            <option ${r.attendance_status === 'Present'    ? 'selected' : ''}>Present</option>
                            <option ${r.attendance_status === 'Absent'     ? 'selected' : ''}>Absent</option>
                          </select>
                        </td>
                        <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                          ${r.status === 'Pending' ? `
                            <button class="btn btn-sm status-btn"     data-id="${r.id}" data-status="Confirmed">Approve</button>
                            <button class="btn btn-clay btn-sm status-btn" data-id="${r.id}" data-status="Rejected">Reject</button>
                          ` : ''}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
            }
          </div>
        `;

        tabContent.querySelectorAll('.attendance-select').forEach(sel => {
          sel.addEventListener('change', async () => {
            const rId = sel.dataset.id;
            const val = sel.value;
            sel.disabled = true;
            try {
              await api.setRegistrationStatus(rId, { attendance_status: val });
              successMsg = 'Attendance updated.';
              await load();
            } catch (err) {
              errorMsg = err.message;
              sel.disabled = false;
              document.getElementById('me-error').textContent   = errorMsg;
              document.getElementById('me-error').style.display = 'block';
            }
          });
        });

        tabContent.querySelectorAll('.status-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const rId = btn.dataset.id;
            const st  = btn.dataset.status;
            btn.disabled = true;
            try {
              await api.setRegistrationStatus(rId, { status: st });
              successMsg = `Registration ${st.toLowerCase()}.`;
              await load();
            } catch (err) {
              errorMsg = err.message;
              renderDOM();
            }
          });
        });

      } else if (tab === 'waitlist') {
        tabContent.innerHTML = `
          <div class="card" style="overflow-x: auto;">
            ${regs.waitlist.length === 0
              ? '<p>No one on the waitlist.</p>'
              : `<table>
                  <thead><tr><th>Student</th><th>Joined waitlist</th></tr></thead>
                  <tbody>
                    ${regs.waitlist.map(w => `
                      <tr>
                        <td>
                          ${escapeHtml(w.student_name)}
                          <br/><span style="font-size:0.75rem;color:var(--ink-soft)">${escapeHtml(w.email)}</span>
                        </td>
                        <td>${new Date(w.joined_date).toLocaleString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
            }
            <p style="margin-top:12px;font-size:0.82rem;color:var(--ink-soft)">
              Waitlisted students are automatically promoted when a confirmed registration is cancelled.
            </p>
          </div>
        `;

      } else if (tab === 'notify') {
        tabContent.innerHTML = `
          <form class="card" id="notify-form" novalidate>
            <h3>Send a custom announcement</h3>
            <p>Delivered to every confirmed and waitlisted student for this event.</p>
            <div class="field">
              <label for="broadcast-msg">Message</label>
              <textarea rows="3" required id="broadcast-msg" placeholder="Type your announcement here…"></textarea>
            </div>
            <button class="btn btn-amber" type="submit" id="broadcast-btn">Send notice</button>
          </form>
        `;

        document.getElementById('notify-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          errorMsg   = '';
          successMsg = '';
          const msg = document.getElementById('broadcast-msg').value.trim();
          if (!msg) {
            errorMsg = 'Message cannot be empty.';
            renderDOM();
            return;
          }
          const btn = document.getElementById('broadcast-btn');
          btn.disabled  = true;
          btn.innerText = 'Sending…';
          try {
            const res = await api.broadcastNotification({ event_id: Number(id), message: msg });
            successMsg = res.message;
            renderDOM();
          } catch (err) {
            errorMsg = err.message;
            renderDOM();
          }
        });

      } else if (tab === 'feedback') {
        tabContent.innerHTML = `
          <div class="card">
            ${feedback.length === 0
              ? '<p>No feedback submitted yet.</p>'
              : feedback.map(f => `
                  <div class="notif-item">
                    <div>
                      <strong>${escapeHtml(f.student_name)}</strong>
                      — ${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}
                      <p style="margin: 4px 0 0">${escapeHtml(f.comments || '')}</p>
                    </div>
                  </div>
                `).join('')
            }
          </div>
        `;
      }
    };

    const load = async () => {
      try {
        const [ev, r, fb] = await Promise.all([
          api.getEvent(id),
          api.eventRegistrations(id),
          api.eventFeedback(id).catch(() => []),
        ]);
        event    = ev;
        regs     = r;
        feedback = fb;
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
