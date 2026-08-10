import { getUser, logout } from './api.js';

// Import views statically so the module graph is explicit
import EventsBrowse from './views/EventsBrowse.js';
import Login from './views/Login.js';
import Register from './views/Register.js';
import EventDetail from './views/EventDetail.js';
import MyRegistrations from './views/MyRegistrations.js';
import Notifications from './views/Notifications.js';
import OrganiserDashboard from './views/OrganiserDashboard.js';
import ManageEvent from './views/ManageEvent.js';
import Analytics from './views/Analytics.js';
import AdminDashboard from './views/AdminDashboard.js';
import ManageUsers from './views/ManageUsers.js';
import Profile from './views/Profile.js';

// ---------------------------------------------------------------------------
// Route table
// Each entry: { view, auth?, roles? }
//   auth:true  → must be logged in (any role)
//   roles:[..] → must be logged in AND have one of these roles
// ---------------------------------------------------------------------------
const routes = {
  '/events':                  { view: EventsBrowse },
  '/events/:id':              { view: EventDetail },
  '/login':                   { view: Login },
  '/register':                { view: Register },
  '/profile':                 { view: Profile, auth: true },
  '/my-registrations':        { view: MyRegistrations, auth: true, roles: ['student'] },
  '/notifications':           { view: Notifications, auth: true },
  '/organiser':               { view: OrganiserDashboard, auth: true, roles: ['organiser', 'administrator'] },
  '/organiser/events/:id':    { view: ManageEvent,          auth: true, roles: ['organiser', 'administrator'] },
  '/organiser/analytics':     { view: Analytics,            auth: true, roles: ['organiser', 'administrator'] },
  '/admin':                   { view: AdminDashboard,       auth: true, roles: ['administrator'] },
  '/admin/users':             { view: ManageUsers,          auth: true, roles: ['administrator'] },
};

// ---------------------------------------------------------------------------
// Route matching — supports :param segments
// ---------------------------------------------------------------------------
function matchRoute(path) {
  for (const routePath in routes) {
    if (routePath.includes(':')) {
      const routeParts = routePath.split('/');
      const pathParts  = path.split('/');
      if (routeParts.length !== pathParts.length) continue;

      let match = true;
      const params = {};
      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          params[routeParts[i].substring(1)] = decodeURIComponent(pathParts[i]);
        } else if (routeParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }
      if (match) return { route: routes[routePath], params };
    } else if (routePath === path) {
      return { route: routes[routePath], params: {} };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Navigation helper — use this everywhere instead of touching window.location.hash
// ---------------------------------------------------------------------------
export function navigate(path) {
  window.location.hash = path;
}

// ---------------------------------------------------------------------------
// Navbar — re-rendered on every route change
// ---------------------------------------------------------------------------
function renderNavbar() {
  const user = getUser();
  const navbar = document.getElementById('navbar');
  const currentPath = window.location.hash.slice(1) || '/events';

  const isActive = (path) => currentPath === path || currentPath.startsWith(path + '/') ? 'active' : '';

  let navLinks = `
    <a href="#/events" class="nav-link ${currentPath === '/events' || currentPath.startsWith('/events/') ? 'active' : ''}">Events</a>
  `;

  if (user?.role === 'student') {
    navLinks += `<a href="#/my-registrations" class="nav-link ${isActive('/my-registrations')}">My Registrations</a>`;
  }

  if (user?.role === 'organiser' || user?.role === 'administrator') {
    navLinks += `
      <a href="#/organiser" class="nav-link ${isActive('/organiser')}">Organiser</a>
      <a href="#/organiser/analytics" class="nav-link ${isActive('/organiser/analytics')}">Analytics</a>
    `;
  }

  if (user?.role === 'administrator') {
    navLinks += `<a href="#/admin" class="nav-link ${isActive('/admin')}">Admin</a>`;
  }

  if (user) {
    navLinks += `<a href="#/notifications" class="nav-link ${isActive('/notifications')}">Notifications</a>`;
  }

  let userHtml = '';
  if (user) {
    userHtml = `
      <a href="#/profile" class="nav-link" style="font-weight:600">${user.name?.split(' ')[0] || 'Profile'}</a>
      <span class="role-tag ${user.role}">${user.role}</span>
      <button class="btn btn-outline btn-sm" id="logout-btn">Log out</button>
    `;
  } else {
    userHtml = `<a href="#/login" class="btn btn-sm">Log in</a>`;
  }

  navbar.innerHTML = `
    <div class="navbar-inner">
      <a href="#/events" class="brand">
        <span class="brand-mark">C</span>
        <span class="brand-text">CEMS <span>Board</span></span>
      </a>
      <nav class="nav-links" aria-label="Main navigation">${navLinks}</nav>
      <div class="nav-user">${userHtml}</div>
    </div>
  `;

  if (user) {
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      logout();
      navigate('/login');
    });
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
// Guard against double-fires when we programmatically set the hash
let _handling = false;

// Tracks the currently-mounted view so we can clean up timers/listeners
// (e.g. polling intervals) before swapping in the next view.
let _currentView = null;

async function handleRoute() {
  if (_handling) return;

  let path = window.location.hash.slice(1);

  // Redirect root or empty hash to /events
  if (!path || path === '/') {
    _handling = true;
    window.location.hash = '/events';
    _handling = false;
    return;
  }

  const user = getUser();

  // Redirect logged-in users away from auth pages
  if ((path === '/login' || path === '/register') && user) {
    _handling = true;
    navigate('/events');
    _handling = false;
    return;
  }

  renderNavbar();

  const match = matchRoute(path);
  const appRoot = document.getElementById('app-root');

  if (!match) {
    navigate('/events');
    return;
  }

  const { route, params } = match;

  // Auth guard
  if (route.auth && !user) {
    navigate('/login');
    return;
  }

  // Role guard
  if (route.roles && (!user || !route.roles.includes(user.role))) {
    navigate(user ? '/events' : '/login');
    return;
  }

  // Tear down the previous view's timers/listeners before mounting the next one.
  if (_currentView && typeof _currentView.unmount === 'function') {
    try { _currentView.unmount(); } catch (e) { console.error('View unmount error:', e); }
  }
  _currentView = route.view;

  appRoot.innerHTML = '<div class="spinner-text">Loading…</div>';

  try {
    await route.view.render(appRoot, params);
  } catch (error) {
    console.error('View render error:', error);
    appRoot.innerHTML = `
      <div class="empty-state">
        <h3>Something went wrong</h3>
        <p>${error.message || 'An unexpected error occurred.'}</p>
        <a href="#/events" class="btn btn-sm" style="margin-top:16px">← Back to events</a>
      </div>`;
  }
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);
