// In local dev, talk to the local backend. Once deployed, talk to the
// Render backend. Update RENDER_BACKEND_URL after you deploy the backend
// (Render gives you a URL like https://cems-backend-xxxx.onrender.com).
const RENDER_BACKEND_URL = "https://cems-backend.onrender.com/api";

const BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000/api"
    : RENDER_BACKEND_URL;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export function getToken() {
  return localStorage.getItem("cems_token");
}

export function getUser() {
  const u = localStorage.getItem("cems_user");
  try {
    return u ? JSON.parse(u) : null;
  } catch {
    // Corrupt storage entry — clear it
    localStorage.removeItem("cems_user");
    return null;
  }
}

export function logout() {
  localStorage.removeItem("cems_token");
  localStorage.removeItem("cems_user");
}

export function loginSuccess(token, user) {
  localStorage.setItem("cems_token", token);
  localStorage.setItem("cems_user", JSON.stringify(user));
}

// ---------------------------------------------------------------------------
// XSS prevention — escape user-generated content before inserting into innerHTML
// ---------------------------------------------------------------------------

/**
 * Parses a 'YYYY-MM-DD' string as a LOCAL date (avoiding UTC timezone-shift
 * bugs from `new Date(dateStr)`) and formats it for display.
 * style: 'long'  -> "Wednesday, September 25, 2026" (default)
 *        'short' -> "Wed, Sep 25, 2026"
 */
export function formatDate(dateStr, style = 'long') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const opts = style === 'short'
    ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
    : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString(undefined, opts);
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Core HTTP request helper
// ---------------------------------------------------------------------------

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error("Cannot reach the server. Please check your connection or ensure the backend is running.");
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = isJson && data?.detail;
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join('; ')
        : "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return data;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const api = {
  // auth
  login:       (email, password) => request("/auth/login",    { method: "POST", body: { email, password }, auth: false }),
  requestOtp:  (payload)         => request("/auth/register/request-otp", { method: "POST", body: payload, auth: false }),
  resendOtp:   (email)           => request("/auth/register/resend-otp",  { method: "POST", body: { email }, auth: false }),
  verifyOtp:   (email, otp)      => request("/auth/register/verify-otp",  { method: "POST", body: { email, otp }, auth: false }),
  googleLogin: (credential, extra = {}) => request("/auth/google", { method: "POST", body: { credential, ...extra }, auth: false }),
  me:          ()                => request("/auth/me"),

  // events
  listEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ""}`);
  },
  getEvent:         (id)          => request(`/events/${id}`),
  createEvent:      (payload)     => request("/events",       { method: "POST",   body: payload }),
  updateEvent:      (id, payload) => request(`/events/${id}`, { method: "PUT",    body: payload }),
  cancelEvent:      (id)          => request(`/events/${id}`, { method: "DELETE" }),
  myOrganisedEvents: ()           => request("/events/mine/organised"),
  pendingApprovalEvents: ()       => request("/events/pending-approval"),
  approveEvent:      (id)         => request(`/events/${id}/approve`, { method: "POST" }),
  rejectEvent:       (id, reason) => request(`/events/${id}/reject`,  { method: "POST", body: { reason } }),

  // registrations
  registerForEvent:     (event_id) => request("/registrations",             { method: "POST",   body: { event_id } }),
  myRegistrations:      ()         => request("/registrations/mine"),
  cancelRegistration:   (id)       => request(`/registrations/${id}`,       { method: "DELETE" }),
  eventRegistrations:   (eventId)  => request(`/registrations/event/${eventId}`),
  setRegistrationStatus:(id, payload) => request(`/registrations/${id}/status`, { method: "PUT", body: payload }),

  // feedback
  giveFeedback:  (payload)  => request("/feedback",             { method: "POST", body: payload }),
  eventFeedback: (eventId)  => request(`/feedback/event/${eventId}`),

  // notifications
  myNotifications:       ()        => request("/notifications/mine"),
  markNotificationRead:  (id)      => request(`/notifications/${id}/read`, { method: "PUT" }),
  broadcastNotification: (payload) => request("/notifications/broadcast",  { method: "POST", body: payload }),

  // venues & resources
  listVenues:     ()        => request("/venues"),
  createVenue:    (payload) => request("/venues",    { method: "POST", body: payload }),
  listResources:  ()        => request("/resources"),
  createResource: (payload) => request("/resources", { method: "POST", body: payload }),

  // admin
  listUsers:   ()            => request("/users"),
  setUserRole: (id, role)    => request(`/users/${id}/role`, { method: "PUT",    body: { role } }),
  deleteUser:  (id)          => request(`/users/${id}`,      { method: "DELETE" }),

  // analytics
  organiserAnalytics: () => request("/analytics/organiser"),
  adminAnalytics:     () => request("/analytics/admin"),
  reportCsvUrl:       () => `${BASE}/analytics/report.csv`,
};