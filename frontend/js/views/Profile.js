import { api, getUser, escapeHtml } from '../api.js';
import { navigate } from '../router.js';

export default {
  async render(container) {
    const user = getUser();

    container.innerHTML = `
      <div>
        <div class="page-head">
          <div>
            <div class="eyebrow">My Account</div>
            <h1>Profile</h1>
            <p>Your account details and role information.</p>
          </div>
        </div>
        <div id="profile-content"><div class="spinner-text">Loading…</div></div>
      </div>
    `;

    // Use cached user from localStorage immediately, then refresh from server
    const renderProfile = (u) => {
      if (!u) {
        document.getElementById('profile-content').innerHTML = `
          <div class="empty-state">
            <h3>Not logged in</h3>
            <p>Please <a href="#/login">log in</a> to view your profile.</p>
          </div>`;
        return;
      }

      const roleLabels = {
        student:       'Student',
        organiser:     'Organiser',
        administrator: 'Administrator',
      };

      document.getElementById('profile-content').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 640px;">
          <div class="card" style="grid-column: 1 / -1;">
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
              <div style="
                width: 56px; height: 56px; border-radius: 50%;
                background: var(--amber); border: 2px solid var(--ink);
                display: flex; align-items: center; justify-content: center;
                font-family: var(--font-display); font-weight: 700; font-size: 1.5rem;
                flex-shrink: 0;
              ">${escapeHtml(u.name?.charAt(0)?.toUpperCase() || '?')}</div>
              <div>
                <h2 style="margin: 0 0 4px">${escapeHtml(u.name || '—')}</h2>
                <span class="role-tag ${escapeHtml(u.role)}">${escapeHtml(roleLabels[u.role] || u.role)}</span>
              </div>
            </div>

            <table>
              <tbody>
                <tr>
                  <th style="width: 140px;">Email</th>
                  <td>${escapeHtml(u.email || '—')}</td>
                </tr>
                <tr>
                  <th>Role</th>
                  <td>${escapeHtml(roleLabels[u.role] || u.role || '—')}</td>
                </tr>
                ${u.department ? `<tr><th>Department</th><td>${escapeHtml(u.department)}</td></tr>` : ''}
                ${u.roll_no    ? `<tr><th>Roll No.</th><td>${escapeHtml(u.roll_no)}</td></tr>` : ''}
                ${u.contact_no ? `<tr><th>Contact</th><td>${escapeHtml(u.contact_no)}</td></tr>` : ''}
              </tbody>
            </table>
          </div>

          ${u.role === 'student' ? `
            <div class="card">
              <h3>Quick links</h3>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
                <a href="#/events" class="btn btn-outline btn-sm">Browse Events</a>
                <a href="#/my-registrations" class="btn btn-outline btn-sm">My Registrations</a>
                <a href="#/notifications" class="btn btn-outline btn-sm">Notifications</a>
              </div>
            </div>` : ''}

          ${u.role === 'organiser' || u.role === 'administrator' ? `
            <div class="card">
              <h3>Quick links</h3>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">
                <a href="#/organiser" class="btn btn-outline btn-sm">Manage Events</a>
                <a href="#/organiser/analytics" class="btn btn-outline btn-sm">Analytics</a>
                ${u.role === 'administrator' ? `<a href="#/admin" class="btn btn-outline btn-sm">Admin Panel</a>` : ''}
              </div>
            </div>` : ''}
        </div>
      `;
    };

    // Show cached data immediately
    renderProfile(user);

    // Refresh from server in background
    try {
      const fresh = await api.me();
      renderProfile(fresh);
    } catch (err) {
      // Server fetch failed but we already showed cached data — show a soft warning
      const content = document.getElementById('profile-content');
      if (content && user) {
        const warning = document.createElement('p');
        warning.style.cssText = 'font-size:0.8rem; color:#888; margin-top: 12px;';
        warning.textContent = 'Could not refresh profile from server.';
        content.appendChild(warning);
      }
    }
  }
};
