import { api, escapeHtml } from '../api.js';

export default {
  async render(container) {
    let users    = null;
    let errorMsg = '';
    let busyId   = null;

    const renderDOM = () => {
      if (!users) {
        container.innerHTML = errorMsg
          ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>`
          : '<div class="spinner-text">Loading…</div>';
        return;
      }

      container.innerHTML = `
        <div>
          <a href="#/admin" class="btn btn-outline btn-sm" style="margin-bottom: 20px; display: inline-block;">← Back to Analytics</a>

          <div class="page-head">
            <div>
              <div class="eyebrow">Administration</div>
              <h1>Manage Users</h1>
              <p>Change user roles or remove accounts. Changes take effect immediately.</p>
            </div>
          </div>

          ${errorMsg ? `<div class="alert alert-error">${escapeHtml(errorMsg)}</div>` : ''}

          <div class="card" style="overflow-x: auto;">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.email)}</td>
                    <td>${escapeHtml(u.department || '—')}</td>
                    <td>
                      <select class="role-select" data-id="${u.id}" ${busyId === u.id ? 'disabled' : ''}>
                        <option value="student"       ${u.role === 'student'       ? 'selected' : ''}>Student</option>
                        <option value="organiser"     ${u.role === 'organiser'     ? 'selected' : ''}>Organiser</option>
                        <option value="administrator" ${u.role === 'administrator' ? 'selected' : ''}>Admin</option>
                      </select>
                    </td>
                    <td>
                      <button
                        class="btn btn-clay btn-sm del-btn"
                        data-id="${u.id}"
                        data-name="${escapeHtml(u.name)}"
                        ${busyId === u.id ? 'disabled' : ''}
                      >Delete</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', async () => {
          const uid = Number(sel.dataset.id);
          const val = sel.value;
          busyId = uid;
          renderDOM();
          try {
            await api.setUserRole(uid, val);
            errorMsg = '';
            await load();
          } catch (err) {
            errorMsg = err.message;
            busyId   = null;
            renderDOM();
          }
        });
      });

      document.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const uid  = Number(btn.dataset.id);
          const name = btn.dataset.name;
          if (!confirm(`Permanently delete user "${name}"? This cannot be undone.`)) return;
          busyId = uid;
          renderDOM();
          try {
            await api.deleteUser(uid);
            errorMsg = '';
            await load();
          } catch (err) {
            errorMsg = err.message;
            busyId   = null;
            renderDOM();
          }
        });
      });
    };

    const load = async () => {
      try {
        users    = await api.listUsers();
        errorMsg = '';
      } catch (err) {
        errorMsg = err.message;
      }
      busyId = null;
      renderDOM();
    };

    renderDOM();
    await load();
  }
};
