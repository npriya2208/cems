import { api, loginSuccess, getUser } from '../api.js';
import { navigate } from '../router.js';
import { renderGoogleButton } from '../google-auth.js';

export default {
  render(container) {
    // Redirect if already logged in
    if (getUser()) {
      navigate('/events');
      return;
    }

    container.innerHTML = `
      <div class="auth-wrap">
        <div class="eyebrow">Welcome back</div>
        <h1>Log in to CEMS</h1>
        <p style="margin-bottom: 20px">Access your dashboard for events, registrations, and notices.</p>

        <div id="login-error" class="alert alert-error" style="display: none;" role="alert"></div>

        <form id="login-form" class="card" novalidate>
          <div class="field">
            <label for="login-email">Email</label>
            <input id="login-email" type="email" autocomplete="email" required placeholder="you@example.com" />
          </div>
          <div class="field">
            <label for="login-password">Password</label>
            <input id="login-password" type="password" autocomplete="current-password" required placeholder="••••••••" />
          </div>
          <button id="login-submit-btn" class="btn btn-block btn-amber" type="submit">
            Log in
          </button>
        </form>

        <div style="display:flex; align-items:center; gap:10px; margin: 16px 0; font-size: 0.8rem; color:#888;">
          <div style="flex:1; height:1px; background:#333"></div>
          <span>OR</span>
          <div style="flex:1; height:1px; background:#333"></div>
        </div>
        <div id="google-signin-btn" style="display:flex; justify-content:center;"></div>

        <div style="margin-top: 16px; font-size: 0.82rem">
          <p style="margin-bottom: 6px">Try a demo account (password: <code>password123</code>):</p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button type="button" class="btn btn-outline btn-sm demo-btn" data-role="student">Student</button>
            <button type="button" class="btn btn-outline btn-sm demo-btn" data-role="organiser">Organiser</button>
            <button type="button" class="btn btn-outline btn-sm demo-btn" data-role="administrator">Admin</button>
          </div>
        </div>

        <p style="margin-top: 20px; font-size: 0.88rem">
          New here? <a href="#/register">Create an account</a>
        </p>
      </div>
    `;

    const form      = document.getElementById('login-form');
    const errorDiv  = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');

    const demoCreds = {
      student:       "student@cems.edu",
      organiser:     "organiser@cems.edu",
      administrator: "admin@cems.edu",
    };

    function showError(msg) {
      errorDiv.textContent = msg; // textContent is XSS-safe
      errorDiv.style.display = 'block';
    }

    function hideError() {
      errorDiv.style.display = 'none';
    }

    // Demo fill buttons
    document.querySelectorAll('.demo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.role;
        document.getElementById('login-email').value    = demoCreds[role] || '';
        document.getElementById('login-password').value = 'password123';
        hideError();
      });
    });

    // Login form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      if (!email || !password) {
        showError('Please enter your email and password.');
        return;
      }

      submitBtn.disabled  = true;
      submitBtn.innerText = 'Logging in…';

      try {
        const data = await api.login(email, password);
        loginSuccess(data.token, data.user);
        navigate('/events');
      } catch (err) {
        showError(err.message);
      } finally {
        submitBtn.disabled  = false;
        submitBtn.innerText = 'Log in';
      }
    });

    // Google Sign-In
    renderGoogleButton('google-signin-btn', {
      onSuccess: () => navigate('/events'),
      onError:   (err) => showError(err.message),
    });
  }
};
