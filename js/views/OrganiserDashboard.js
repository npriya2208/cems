import { api, escapeHtml } from '../api.js';

let _pollTimer = null;

export default {
  async render(container) {
    let events   = null;
    let venues   = [];
    let errorMsg = '';
    let successMsg = '';
    let showForm = false;

    let form = {
      name: '', category: 'Technical', description: '',
      date: '', time: '', venue_id: '', capacity: 50,
    };

    const renderDOM = () => {
      container.innerHTML = `
        <div>
          <div class="page-head">
            <div>
              <div class="eyebrow">Organiser</div>
              <h1>Manage Your Events</h1>
              <p>Create events, allocate venues, and track registrations.</p>
            </div>
            <button class="btn btn-amber" id="toggle-form-btn">
              ${showForm ? 'Close form' : '+ New event'}
            </button>
          </div>

          <div id="od-error"   class="alert alert-error"   style="display:${errorMsg   ? 'block' : 'none'};">${escapeHtml(errorMsg)}</div>
          <div id="od-success" class="alert alert-success" style="display:${successMsg ? 'block' : 'none'};">${escapeHtml(successMsg)}</div>

          ${showForm ? `
            <form class="card" id="new-event-form" style="margin-bottom: 28px" novalidate>
              <h3>New event</h3>
              <div class="field">
                <label for="ev-name">Event name</label>
                <input required id="ev-name" value="${escapeHtml(form.name)}" placeholder="e.g. Annual Tech Fest" />
              </div>
              <div class="form-grid">
                <div class="field">
                  <label for="ev-category">Category</label>
                  <select id="ev-category">
                    ${['Technical', 'Cultural', 'Sports', 'Workshop', 'Seminar'].map(c =>
                      `<option value="${c}" ${form.category === c ? 'selected' : ''}>${c}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="field">
                  <label for="ev-capacity">Capacity</label>
                  <input type="number" min="1" max="10000" required id="ev-capacity" value="${Number(form.capacity)}" />
                </div>
              </div>
              <div class="field">
                <label for="ev-description">Description</label>
                <textarea rows="2" id="ev-description" placeholder="Brief description of the event…">${escapeHtml(form.description)}</textarea>
              </div>
              <div class="form-grid">
                <div class="field">
                  <label for="ev-date">Date</label>
                  <input type="date" required id="ev-date" value="${escapeHtml(form.date)}" />
                </div>
                <div class="field">
                  <label for="ev-time">Time</label>
                  <input type="time" required id="ev-time" value="${escapeHtml(form.time)}" />
                </div>
              </div>
              <div class="field">
                <label for="ev-venue">Venue <span style="font-weight:400;color:var(--ink-soft)">(conflicts are checked automatically)</span></label>
                <select id="ev-venue">
                  <option value="">No venue / TBA</option>
                  ${venues.map(v =>
                    `<option value="${v.id}" ${form.venue_id == v.id ? 'selected' : ''}>${escapeHtml(v.name)} — ${escapeHtml(v.location)} (cap. ${v.capacity})</option>`
                  ).join('')}
                </select>
              </div>
              <div id="form-error" class="alert alert-error" style="display:none;"></div>
              <button class="btn btn-amber" type="submit" id="submit-ev-btn">Submit event</button>
              <p style="margin-top:8px;color:#888;font-size:.9em">
                New events go to an administrator for approval before students can see or register for them.
              </p>
            </form>
          ` : ''}

          ${!events
            ? '<div class="spinner-text">Loading…</div>'
            : events.length === 0
              ? '<div class="empty-state"><h3>No events yet</h3><p>Create your first event to get started.</p></div>'
              : `<div class="card" style="overflow-x: auto;">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th><th>Date</th><th>Venue</th>
                        <th>Registered</th><th>Waitlist</th><th>Status</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${events.map(e => `
                        <tr>
                          <td><a href="#/organiser/events/${e.id}">${escapeHtml(e.name)}</a></td>
                          <td>${escapeHtml(e.date)} · ${escapeHtml(e.time)}</td>
                          <td>${escapeHtml(e.venue?.name || '—')}</td>
                          <td>${e.confirmedCount} / ${e.capacity}</td>
                          <td>${e.waitlistCount}</td>
                          <td><span class="status-pill ${escapeHtml(e.status.toLowerCase())}">${escapeHtml(e.status === 'PendingApproval' ? 'Pending Approval' : e.status)}</span></td>
                          <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <a href="#/organiser/events/${e.id}" class="btn btn-outline btn-sm">Manage</a>
                            ${(e.status === 'Scheduled' || e.status === 'PendingApproval')
                              ? `<button class="btn btn-clay btn-sm cancel-ev-btn" data-id="${e.id}" data-name="${escapeHtml(e.name)}">Cancel</button>`
                              : ''}
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </div>
      `;

      document.getElementById('toggle-form-btn').addEventListener('click', () => {
        showForm = !showForm;
        errorMsg  = '';
        successMsg = '';
        renderDOM();
      });

      if (showForm) {
        const formEl = document.getElementById('new-event-form');
        const formErr = document.getElementById('form-error');

        formEl.addEventListener('submit', async (e) => {
          e.preventDefault();
          formErr.style.display = 'none';
          errorMsg   = '';
          successMsg = '';

          const btn = document.getElementById('submit-ev-btn');

          // Capture form values
          const name     = document.getElementById('ev-name').value.trim();
          const capacity = Number(document.getElementById('ev-capacity').value);
          const date     = document.getElementById('ev-date').value;
          const time     = document.getElementById('ev-time').value;

          // Client-side validation
          if (!name) {
            formErr.textContent = 'Event name is required.';
            formErr.style.display = 'block';
            return;
          }
          if (!date || !time) {
            formErr.textContent = 'Date and time are required.';
            formErr.style.display = 'block';
            return;
          }
          if (!capacity || capacity < 1) {
            formErr.textContent = 'Capacity must be at least 1.';
            formErr.style.display = 'block';
            return;
          }

          form = {
            name,
            category:    document.getElementById('ev-category').value,
            capacity,
            description: document.getElementById('ev-description').value.trim(),
            date,
            time,
            venue_id:    document.getElementById('ev-venue').value,
          };

          btn.disabled  = true;
          btn.innerText = 'Submitting…';

          try {
            const created = await api.createEvent({
              ...form,
              venue_id: form.venue_id ? Number(form.venue_id) : null,
              capacity: Number(form.capacity),
            });
            successMsg = created.status === 'Scheduled'
              ? `"${name}" was created and published.`
              : `"${name}" was submitted and is awaiting administrator approval.`;
            form = { name: '', category: 'Technical', description: '', date: '', time: '', venue_id: '', capacity: 50 };
            showForm = false;
            await load();
          } catch (err) {
            formErr.textContent   = err.message;
            formErr.style.display = 'block';
            btn.disabled  = false;
            btn.innerText = 'Submit event';
          }
        });
      }

      document.querySelectorAll('.cancel-ev-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id   = btn.dataset.id;
          const name = btn.dataset.name;
          if (!confirm(`Cancel "${name}"? Registered students will be notified.`)) return;
          btn.disabled = true;
          try {
            await api.cancelEvent(id);
            successMsg = `"${name}" has been cancelled.`;
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
        const [ev, vn] = await Promise.all([api.myOrganisedEvents(), api.listVenues()]);
        events = ev;
        venues = vn;
        errorMsg = '';
      } catch (err) {
        errorMsg = err.message;
        events = events ?? [];
      }
      renderDOM();
    };

    // Background refresh so approvals/registrations/waitlist made elsewhere
    // (by an admin or a student) show up here without a manual reload.
    // Skipped while the create-event form is open so it doesn't wipe in-progress input.
    const refreshQuietly = async () => {
      if (showForm) return;
      try {
        const fresh = await api.myOrganisedEvents();
        if (JSON.stringify(fresh) !== JSON.stringify(events)) {
          events = fresh;
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
