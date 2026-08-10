import { api, loginSuccess } from './api.js';
import { navigate } from './router.js';

// Must match the client ID set in index.html and backend/auth.py (GOOGLE_CLIENT_ID).
// Set GOOGLE_CLIENT_ID in your environment / backend and replace the placeholder below.
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";

const MAX_RETRIES = 25;        // 25 × 200 ms = 5 s max wait
const RETRY_INTERVAL_MS = 200;

/**
 * Renders a "Sign in with Google" button inside the element with id `mountId`.
 * On success, exchanges the Google credential for a CEMS session (creating the
 * user record on first login) and calls onSuccess(user).
 */
export function renderGoogleButton(mountId, { onError, onSuccess, role } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  let retries = 0;

  function init() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (retries >= MAX_RETRIES) {
        // Google script didn't load within 5 s (possibly blocked by an ad blocker)
        mount.innerHTML = `
          <p style="font-size:0.8rem;color:#888;text-align:center;">
            Google Sign-In is unavailable.<br>
            <span style="font-size:0.72rem">It may be blocked by your browser or a content blocker.</span>
          </p>`;
        return;
      }
      retries++;
      setTimeout(init, RETRY_INTERVAL_MS);
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const data = await api.googleLogin(response.credential, role ? { role } : {});
          loginSuccess(data.token, data.user);
          if (onSuccess) {
            onSuccess(data.user);
          } else {
            navigate('/events');
          }
        } catch (err) {
          if (onError) onError(err);
        }
      },
    });

    window.google.accounts.id.renderButton(mount, {
      theme: "outline",
      size: "large",
      width: 320,
      text: "continue_with",
    });
  }

  init();
}
