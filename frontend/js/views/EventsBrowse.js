import { api, escapeHtml, formatDate } from '../api.js';

function renderEventCard(event) {
  const isFull   = event.seatsRemaining <= 0;
  const pillText = isFull
    ? 'Waitlist open'
    : `${event.seatsRemaining} seat${event.seatsRemaining === 1 ? '' : 's'} left`;

  return `
    <article class="event-card">
      <span class="event-card-tag">${escapeHtml(event.category || 'General')}</span>
      <h3>
        <a href="#/events/${event.id}" style="text-decoration: none; color: inherit;">
          ${escapeHtml(event.name)}
        </a>
      </h3>
      <p style="font-size: 0.88rem">${escapeHtml(event.description || '')}</p>
      <div class="event-meta">
        <span>📅 ${formatDate(event.date, 'short')} · ${escapeHtml(event.time)}</span>
        <span>📍 ${escapeHtml(event.venue?.name || 'Venue TBA')}</span>
      </div>
      <div class="event-card-footer">
        <span class="status-pill scheduled">${escapeHtml(pillText)}</span>
        <a href="#/events/${event.id}" class="btn btn-sm">View</a>
      </div>
    </article>
  `;
}

// Module-scoped (not per-render) so unmount() can always reach the current timer.
let _pollTimer = null;

export default {
  async render(container) {
    let events   = null;
    let category = '';
    let q        = '';
    let errorMsg = '';
    const categories = ['Technical', 'Cultural', 'Sports', 'Workshop', 'Seminar'];
    const POLL_INTERVAL_MS = 15000;

    const renderDOM = () => {
      container.innerHTML = `
        <div>
          <div class="page-head">
            <div>
              <div class="eyebrow">Notice board</div>
              <h1>Upcoming Events</h1>
              <p>Browse what's on across campus and register in a couple of clicks.</p>
            </div>
          </div>

          <form class="filters" id="events-filter-form" role="search">
            <input
              id="events-q"
              type="search"
              placeholder="Search events…"
              value="${escapeHtml(q)}"
              style="flex: 1; min-width: 180px; padding: 10px 12px; border: 1.5px solid var(--line-strong); border-radius: 3px; font-family: var(--font-body);"
              aria-label="Search events"
            />
            <select
              id="events-category"
              style="padding: 10px 12px; border: 1.5px solid var(--line-strong); border-radius: 3px; font-family: var(--font-body);"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              ${categories.map(c => `<option value="${escapeHtml(c)}" ${c === category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <button class="btn btn-sm" type="submit">Filter</button>
            ${(q || category) ? `<button class="btn btn-outline btn-sm" type="button" id="clear-filters-btn">Clear</button>` : ''}
          </form>

          ${errorMsg ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>` : ''}

          <div id="events-content">
            ${!events
              ? '<div class="spinner-text">Loading events…</div>'
              : events.length === 0
                ? `<div class="empty-state">
                     <h3>No events match your search</h3>
                     <p>Try clearing filters or check back soon — new events are added regularly.</p>
                   </div>`
                : `<div class="board" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
                     ${events.map(renderEventCard).join('')}
                   </div>`
            }
          </div>
        </div>
      `;

      document.getElementById('events-filter-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        q        = document.getElementById('events-q').value.trim();
        category = document.getElementById('events-category').value;
        load();
      });

      document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
        q        = '';
        category = '';
        load();
      });
    };

    const load = async () => {
      events = null;
      renderDOM(); // show loading state
      try {
        const params = {};
        if (category) params.category = category;
        if (q)        params.q        = q;
        events   = await api.listEvents(params);
        errorMsg = '';
      } catch (err) {
        errorMsg = err.message;
        events   = [];
      }
      renderDOM();
    };

    // Quiet refresh used by polling: refetches in the background and only
    // re-renders if something actually changed, so it never disrupts a user
    // mid-scroll or mid-filter with a flashing loading state.
    const refreshQuietly = async () => {
      try {
        const params = {};
        if (category) params.category = category;
        if (q)        params.q        = q;
        const fresh = await api.listEvents(params);
        if (JSON.stringify(fresh) !== JSON.stringify(events)) {
          events = fresh;
          renderDOM();
        }
      } catch (err) {
        // Silent on purpose — a failed background refresh shouldn't interrupt browsing.
      }
    };

    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(refreshQuietly, POLL_INTERVAL_MS);

    await load();
  },

  // Called by the router right before the next view is mounted, so the
  // polling interval never keeps running (and firing network calls) after
  // the user has navigated away from this page.
  unmount() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }
};
