import { api, escapeHtml } from '../api.js';

export default {
  async render(container) {
    let items    = null;
    let errorMsg = '';

    const renderDOM = () => {
      if (!items) {
        container.innerHTML = errorMsg
          ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>`
          : '<div class="spinner-text">Loading…</div>';
        return;
      }

      const unread = items.filter(n => !n.is_read);

      container.innerHTML = `
        <div>
          <div class="eyebrow">Alerts</div>
          <h1>Notifications ${unread.length > 0 ? `<span style="font-family:var(--font-mono);font-size:1rem;color:var(--amber-deep)">(${unread.length} unread)</span>` : ''}</h1>
          <p style="margin-bottom: 24px">Confirmations, reminders, and updates from event organisers.</p>

          ${errorMsg ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>` : ''}

          ${items.length === 0
            ? `<div class="empty-state">
                 <h3>All caught up</h3>
                 <p>You have no notifications yet.</p>
               </div>`
            : `<div class="card">
                ${unread.length > 0
                  ? `<div style="margin-bottom:12px;">
                      <button class="btn btn-outline btn-sm" id="mark-all-btn">Mark all as read</button>
                    </div>`
                  : ''}
                ${items.map(n => `
                  <div class="notif-item ${n.is_read ? 'read' : ''}">
                    <span class="notif-dot" title="${n.is_read ? 'Read' : 'Unread'}"></span>
                    <div style="flex: 1">
                      <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                        <strong style="font-size: 0.82rem">${escapeHtml(n.type)}</strong>
                        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--ink-soft);">
                          ${new Date(n.sent_date).toLocaleString()}
                        </span>
                      </div>
                      <p style="margin: 4px 0 0">${escapeHtml(n.message)}</p>
                    </div>
                    ${!n.is_read
                      ? `<button class="btn btn-outline btn-sm mark-read-btn" data-id="${n.id}">Mark read</button>`
                      : ''}
                  </div>
                `).join('')}
              </div>`
          }
        </div>
      `;

      // Mark individual notification as read
      document.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled  = true;
          btn.innerText = '…';
          try {
            await api.markNotificationRead(id);
            const notif = items.find(n => n.id === Number(id));
            if (notif) notif.is_read = 1;
            renderDOM();
          } catch (err) {
            errorMsg = err.message;
            renderDOM();
          }
        });
      });

      // Mark all as read
      document.getElementById('mark-all-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('mark-all-btn');
        btn.disabled  = true;
        btn.innerText = 'Marking…';
        try {
          await Promise.all(
            items.filter(n => !n.is_read).map(n => api.markNotificationRead(n.id))
          );
          items.forEach(n => { n.is_read = 1; });
          renderDOM();
        } catch (err) {
          errorMsg = err.message;
          renderDOM();
        }
      });
    };

    const load = async () => {
      try {
        items    = await api.myNotifications();
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
