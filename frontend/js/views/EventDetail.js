import { api, getUser, escapeHtml, formatDate } from '../api.js';
import { navigate } from '../router.js';

/** Returns true if the event date is strictly before today (local time). */
function isEventPast(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const eventDate = new Date(y, m - 1, d);
  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
}

export default {
  async render(container, params) {
    const id   = params.id;
    const user = getUser();

    let event     = null;
    let myStatus  = null;   // 'Confirmed' | 'Waiting' | null
    let errorMsg  = '';
    let successMsg = '';
    let rating    = '5';

    const renderDOM = () => {
      if (!event) {
        container.innerHTML = errorMsg
          ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>`
          : '<div class="spinner-text">Loading event…</div>';
        return;
      }

      const isPast = isEventPast(event.date);

      container.innerHTML = `
        <div>
          <button class="btn btn-outline btn-sm" style="margin-bottom: 20px" id="back-btn">← Back</button>

          <div class="card" style="margin-bottom: 20px">
            <span class="event-card-tag">${escapeHtml(event.category || 'General')}</span>
            <h1>${escapeHtml(event.name)}</h1>
            <p>${escapeHtml(event.description || '')}</p>

            <div class="event-meta" style="margin-top: 16px">
              <span>📅 ${formatDate(event.date)} · ${escapeHtml(event.time)}</span>
              <span>📍 ${escapeHtml(event.venue?.name || 'TBA')} ${event.venue?.location ? `(${escapeHtml(event.venue.location)})` : ''}</span>
              <span>👥 Capacity ${event.capacity} · ${event.confirmedCount} confirmed · ${event.waitlistCount} waitlisted</span>
              <span>Status: <span class="status-pill ${escapeHtml(event.status.toLowerCase())}">${escapeHtml(event.status)}</span></span>
            </div>

            <div id="ed-error"   class="alert alert-error"   style="display:${errorMsg   ? 'block' : 'none'}; margin-top: 12px;">${escapeHtml(errorMsg)}</div>
            <div id="ed-success" class="alert alert-success" style="display:${successMsg ? 'block' : 'none'}; margin-top: 12px;">${escapeHtml(successMsg)}</div>

            <div id="ed-actions" style="margin-top: 16px;"></div>
          </div>

          <div id="ed-feedback"></div>
        </div>
      `;

      document.getElementById('back-btn').addEventListener('click', () => window.history.back());

      // --- Registration actions ---
      const actionsDiv = document.getElementById('ed-actions');

      if (user?.role === 'student' && event.status === 'Scheduled' && !isPast) {
        if (myStatus === 'Confirmed') {
          actionsDiv.innerHTML = `<div class="alert alert-success">You're registered for this event. ✓</div>`;
        } else if (myStatus === 'Waiting') {
          actionsDiv.innerHTML = `<div class="alert alert-error" style="background:#fdecd6;border-color:var(--amber);color:var(--amber-deep);">You're on the waitlist for this event.</div>`;
        } else {
          actionsDiv.innerHTML = `
            <button class="btn btn-amber" id="register-btn">
              ${event.seatsRemaining > 0 ? 'Register for this event' : 'Join waitlist'}
            </button>`;
          document.getElementById('register-btn').addEventListener('click', handleRegister);
        }
      } else if (!user) {
        actionsDiv.innerHTML = `<p style="margin-top: 12px"><a href="#/login">Log in</a> as a student to register for this event.</p>`;
      } else if (isPast || event.status === 'Completed') {
        actionsDiv.innerHTML = `<p style="color: var(--ink-soft); font-size: 0.88rem; margin-top: 8px;">This event has ended.</p>`;
      } else if (event.status === 'Cancelled') {
        actionsDiv.innerHTML = `<div class="alert alert-error">This event has been cancelled.</div>`;
      }

      // --- Feedback form ---
      const feedbackDiv = document.getElementById('ed-feedback');
      if (user?.role === 'student' && myStatus === 'Confirmed' && (isPast || event.status === 'Completed')) {
        feedbackDiv.innerHTML = `
          <div class="card">
            <h3>Give feedback</h3>
            <p>How was your experience at this event?</p>
            <form id="feedback-form" novalidate>
              <div class="field">
                <label for="fb-rating">Rating (1–5)</label>
                <select id="fb-rating">
                  ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${String(rating) === String(n) ? 'selected' : ''}>${n} ${'★'.repeat(n)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="fb-comments">Comments</label>
                <textarea id="fb-comments" rows="3" placeholder="Optional — share your thoughts…"></textarea>
              </div>
              <button class="btn btn-amber" type="submit" id="fb-submit-btn">Submit feedback</button>
            </form>
          </div>
        `;
        document.getElementById('feedback-form').addEventListener('submit', handleFeedback);
      }
    };

    const load = async () => {
      try {
        event = await api.getEvent(id);
        if (user?.role === 'student') {
          const mine = await api.myRegistrations();
          const reg  = mine.registrations.find(r => r.event_id === Number(id) && r.status === 'Confirmed');
          const wl   = mine.waitlist.find(w => w.event_id === Number(id));
          myStatus = reg ? 'Confirmed' : wl ? 'Waiting' : null;
        }
        errorMsg = '';
      } catch (err) {
        errorMsg = err.message;
      }
      renderDOM();
    };

    const handleRegister = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerText = 'Registering…';
      errorMsg  = '';
      successMsg = '';
      try {
        const res = await api.registerForEvent(Number(id));
        successMsg = res.type === 'waitlist'
          ? "Event is full — you've been added to the waitlist."
          : "You're registered! A confirmation has been sent.";
        await load();
      } catch (err) {
        errorMsg = err.message;
        renderDOM();
      }
      // Button is re-created by renderDOM() so no need to re-enable it
    };

    const handleFeedback = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('fb-submit-btn');
      btn.disabled  = true;
      btn.innerText = 'Submitting…';
      errorMsg   = '';
      successMsg  = '';
      rating = document.getElementById('fb-rating').value;
      const comments = document.getElementById('fb-comments').value.trim();

      try {
        await api.giveFeedback({ event_id: Number(id), rating: Number(rating), comments });
        successMsg = 'Thanks — your feedback was submitted.';
        renderDOM();
      } catch (err) {
        errorMsg = err.message;
        renderDOM();
      }
      // btn is replaced by renderDOM so no finally needed
    };

    renderDOM();   // initial skeleton
    await load();
  }
};
