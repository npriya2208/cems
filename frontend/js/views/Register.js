import { api, getUser, loginSuccess } from '../api.js';
import { navigate } from '../router.js';
import { renderGoogleButton } from '../google-auth.js';

const PHONE_REGEX = /^[6-9]\d{9}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Keep this in sync with backend/validators.py ADMISSION_NO_* constants.
const ADMISSION_NO_MIN = 20230001;
const ADMISSION_NO_MAX = 20241000;
const ADMISSION_NO_PREFIXES = ['CE', 'EXTC', 'IT', 'MECH', 'ECS', 'AUTO'];
const ADMISSION_NO_REGEX = new RegExp(`^(${ADMISSION_NO_PREFIXES.join('|')})(\\d{8})$`);

function validateAdmissionNumber(rollNo) {
  const value = (rollNo || '').trim().toUpperCase();
  const match = ADMISSION_NO_REGEX.exec(value);
  if (!match) {
    return `Admission number must be one of ${ADMISSION_NO_PREFIXES.join(', ')} followed by an 8-digit year+serial code, e.g. CE20230001.`;
  }
  const number = parseInt(match[2], 10);
  if (number < ADMISSION_NO_MIN || number > ADMISSION_NO_MAX) {
    return `Admission number must be between ${match[1]}${ADMISSION_NO_MIN} and ${match[1]}${ADMISSION_NO_MAX}.`;
  }
  return null;
}

// Keep this in sync with backend/validators.py ALLOWED_DOMAINS.
const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com',
  'student.mes.ac.in',
  'student.pillai.edu.in',
  'mes.ac.in',
  'pillai.edu.in',
];
const EMAIL_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

function isAllowedEmail(email) {
  if (!EMAIL_REGEX.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export default {
  render(container) {
    // Redirect if already logged in
    if (getUser()) {
      navigate('/events');
      return;
    }

    // Local, per-render state. Re-created every time render() runs so no
    // stale state leaks across navigations.
    const state = { step: 'details', pendingEmail: null, resendCooldown: 0, cooldownTimer: null };

    container.innerHTML = `
      <div class="auth-wrap">
        <div class="eyebrow">Register on portal</div>
        <h1>Create your account</h1>
        <p style="margin-bottom:20px">
          Join CEMS as a student, organiser, or administrator.
        </p>

        <div id="register-error"   class="alert alert-error"   style="display:none;" role="alert"></div>
        <div id="register-success" class="alert alert-success" style="display:none;" role="status"></div>

        <form id="register-form" class="card" novalidate>

          <div class="field">
            <label for="reg-name">Full Name</label>
            <input id="reg-name" type="text" autocomplete="name" required placeholder="Your full name" />
          </div>

          <div class="field">
            <label for="reg-email">Email</label>
            <input id="reg-email" type="email" autocomplete="email" required placeholder="you@gmail.com or you@student.mes.ac.in" />
            <small style="color:#888">
              Allowed domains: ${ALLOWED_EMAIL_DOMAINS.join(', ')}.
            </small>
          </div>

          <div class="field">
            <label for="reg-password">Password</label>
            <input id="reg-password" type="password" autocomplete="new-password" required placeholder="Min 8 chars" />
            <small style="color:#888">
              Minimum 8 characters with uppercase, lowercase, number and special character.
            </small>
          </div>

          <div class="field">
            <label for="reg-role">Role</label>
            <select id="reg-role">
              <option value="student">Student</option>
              <option value="organiser">Organiser (Faculty Coordinator / Club Head)</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="reg-department">Department</label>
              <input id="reg-department" type="text" placeholder="e.g. COMP" />
            </div>
            <div class="field" id="roll-no-field">
              <label for="reg-roll-no">Admission Number</label>
              <input id="reg-roll-no" type="text" placeholder="e.g. CE20230001" />
              <small style="color:#888">Format: CE/EXTC/IT/MECH/ECS/AUTO + year + serial, e.g. CE20230001–CE20241000.</small>
            </div>
          </div>

          <div class="field">
            <label for="reg-contact-no">Contact Number</label>
            <input id="reg-contact-no" type="tel" autocomplete="tel" placeholder="10-digit Mobile number" />
          </div>

          <button id="register-btn" class="btn btn-block btn-amber" type="submit">
            Send Verification Code
          </button>

        </form>

        <form id="otp-form" class="card" style="display:none;" novalidate>
          <p>Enter the 6-digit code sent to <strong id="otp-email-label"></strong>.</p>
          <div class="field">
            <label for="otp-code">Verification Code</label>
            <input id="otp-code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
                   autocomplete="one-time-code" placeholder="123456" />
          </div>
          <button id="verify-otp-btn" class="btn btn-block btn-amber" type="submit">Verify &amp; Create Account</button>
          <button id="resend-otp-btn" class="btn btn-block" type="button" style="margin-top:8px;">Resend Code</button>
          <button id="back-to-details-btn" class="btn btn-block" type="button" style="margin-top:8px;">Use a different email</button>
        </form>

        <div id="google-signup-wrap">
          <div style="display:flex;align-items:center;gap:10px;margin:16px 0;">
            <div style="flex:1;height:1px;background:#333"></div>
            <span>OR</span>
            <div style="flex:1;height:1px;background:#333"></div>
          </div>
          <div id="google-signup-btn" style="display:flex;justify-content:center;"></div>
        </div>

        <p style="margin-top:20px">
          Already have an account? <a href="#/login">Log in</a>
        </p>
      </div>
    `;

    const detailsForm = document.getElementById('register-form');
    const otpForm      = document.getElementById('otp-form');
    const roleSelect   = document.getElementById('reg-role');
    const errorDiv      = document.getElementById('register-error');
    const successDiv    = document.getElementById('register-success');
    const submitBtn     = document.getElementById('register-btn');
    const verifyBtn      = document.getElementById('verify-otp-btn');
    const resendBtn       = document.getElementById('resend-otp-btn');
    const backBtn         = document.getElementById('back-to-details-btn');
    const googleWrap        = document.getElementById('google-signup-wrap');

    function showError(msg) {
      errorDiv.textContent   = msg;
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
    }

    function showSuccess(msg) {
      successDiv.textContent   = msg;
      successDiv.style.display = 'block';
      errorDiv.style.display = 'none';
    }

    function hideMessages() {
      errorDiv.style.display   = 'none';
      successDiv.style.display = 'none';
    }

    function goToOtpStep(email) {
      state.step = 'otp';
      state.pendingEmail = email;
      detailsForm.style.display = 'none';
      googleWrap.style.display = 'none';
      otpForm.style.display = 'block';
      document.getElementById('otp-email-label').textContent = email;
      document.getElementById('otp-code').value = '';
      document.getElementById('otp-code').focus();
      startResendCooldown();
    }

    function goToDetailsStep() {
      state.step = 'details';
      state.pendingEmail = null;
      otpForm.style.display = 'none';
      detailsForm.style.display = 'block';
      googleWrap.style.display = 'block';
      hideMessages();
      if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    }

    function startResendCooldown() {
      state.resendCooldown = 30;
      resendBtn.disabled = true;
      resendBtn.innerText = `Resend Code (${state.resendCooldown}s)`;
      if (state.cooldownTimer) clearInterval(state.cooldownTimer);
      state.cooldownTimer = setInterval(() => {
        state.resendCooldown -= 1;
        if (state.resendCooldown <= 0) {
          clearInterval(state.cooldownTimer);
          resendBtn.disabled = false;
          resendBtn.innerText = 'Resend Code';
        } else {
          resendBtn.innerText = `Resend Code (${state.resendCooldown}s)`;
        }
      }, 1000);
    }

    // Toggle Roll No visibility based on role
    function updateRoleFields() {
      const isStudent = roleSelect.value === 'student';
      document.getElementById('roll-no-field').style.display = isStudent ? 'block' : 'none';
    }

    roleSelect.addEventListener('change', updateRoleFields);
    updateRoleFields(); // run on initial render

    detailsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideMessages();

      const name       = document.getElementById('reg-name').value.trim();
      const email      = document.getElementById('reg-email').value.trim().toLowerCase();
      const password   = document.getElementById('reg-password').value;
      const role       = roleSelect.value;
      const department = document.getElementById('reg-department').value.trim();
      const rollNo     = document.getElementById('reg-roll-no').value.trim();
      const contactNo  = document.getElementById('reg-contact-no').value.trim();

      // --- Client-side validation ---
      if (!name || name.length < 2) {
        showError('Please enter your full name (at least 2 characters).');
        return;
      }

      if (!isAllowedEmail(email)) {
        showError(`Please use a college or gmail address (${ALLOWED_EMAIL_DOMAINS.join(', ')}).`);
        return;
      }

      if (role === 'student') {
        if (!rollNo) {
          showError('Admission number is required for students.');
          return;
        }
        const rollErr = validateAdmissionNumber(rollNo);
        if (rollErr) {
          showError(rollErr);
          return;
        }
      }

      if (!PASSWORD_REGEX.test(password)) {
        showError('Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.');
        return;
      }

      if (contactNo && !PHONE_REGEX.test(contactNo)) {
        showError('Contact number must be a 10-digit Indian mobile number starting with 6–9.');
        return;
      }

      submitBtn.disabled  = true;
      submitBtn.innerText = 'Sending code…';

      try {
        await api.requestOtp({
          name,
          email,
          password,
          role,
          department: department || undefined,
          roll_no:    rollNo     || undefined,
          contact_no: contactNo  || undefined,
        });

        showSuccess(`A verification code was sent to ${email}.`);
        goToOtpStep(email);
      } catch (err) {
        showError(err.message);
      } finally {
        submitBtn.disabled  = false;
        submitBtn.innerText = 'Send Verification Code';
      }
    });

    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideMessages();

      const otp = document.getElementById('otp-code').value.trim();
      if (!/^\d{6}$/.test(otp)) {
        showError('Enter the 6-digit code sent to your email.');
        return;
      }

      verifyBtn.disabled  = true;
      verifyBtn.innerText = 'Verifying…';

      try {
        const result = await api.verifyOtp(state.pendingEmail, otp);
        loginSuccess(result.token, result.user);
        showSuccess('Account verified! Redirecting…');
        setTimeout(() => navigate('/events'), 1000);
      } catch (err) {
        showError(err.message);
      } finally {
        verifyBtn.disabled  = false;
        verifyBtn.innerText = 'Verify & Create Account';
      }
    });

    resendBtn.addEventListener('click', async () => {
      hideMessages();
      resendBtn.disabled = true;
      try {
        await api.resendOtp(state.pendingEmail);
        showSuccess(`A new code was sent to ${state.pendingEmail}.`);
        startResendCooldown();
      } catch (err) {
        showError(err.message);
        resendBtn.disabled = false;
      }
    });

    backBtn.addEventListener('click', goToDetailsStep);

    renderGoogleButton('google-signup-btn', {
      role: roleSelect.value,
      onSuccess: () => navigate('/events'),
      onError:   (err) => showError(err.message),
    });
  }
};
