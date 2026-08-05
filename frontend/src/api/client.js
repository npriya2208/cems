const BASE = "https://cems-backend-9m0y.onrender.com/api";

function getToken() {
  return localStorage.getItem("cems_token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = (isJson && data?.error) || "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data;
}

export const api = {
  // auth
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me"),

  // events
  listEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ""}`);
  },
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (payload) => request("/events", { method: "POST", body: payload }),
  updateEvent: (id, payload) => request(`/events/${id}`, { method: "PUT", body: payload }),
  cancelEvent: (id) => request(`/events/${id}`, { method: "DELETE" }),
  myOrganisedEvents: () => request("/events/mine/organised"),

  // registrations
  registerForEvent: (event_id) => request("/registrations", { method: "POST", body: { event_id } }),
  myRegistrations: () => request("/registrations/mine"),
  cancelRegistration: (id) => request(`/registrations/${id}`, { method: "DELETE" }),
  eventRegistrations: (eventId) => request(`/registrations/event/${eventId}`),
  setRegistrationStatus: (id, payload) => request(`/registrations/${id}/status`, { method: "PUT", body: payload }),

  // feedback
  giveFeedback: (payload) => request("/feedback", { method: "POST", body: payload }),
  eventFeedback: (eventId) => request(`/feedback/event/${eventId}`),

  // notifications
  myNotifications: () => request("/notifications/mine"),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PUT" }),
  broadcastNotification: (payload) => request("/notifications/broadcast", { method: "POST", body: payload }),

  // venues & resources
  listVenues: () => request("/venues"),
  createVenue: (payload) => request("/venues", { method: "POST", body: payload }),
  listResources: () => request("/resources"),
  createResource: (payload) => request("/resources", { method: "POST", body: payload }),

  // admin
  listUsers: () => request("/users"),
  setUserRole: (id, role) => request(`/users/${id}/role`, { method: "PUT", body: { role } }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  // analytics
  organiserAnalytics: () => request("/analytics/organiser"),
  adminAnalytics: () => request("/analytics/admin"),
  reportCsvUrl: () => `${BASE}/analytics/report.csv`,
};

export { getToken };
