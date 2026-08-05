import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="brand">
          <span className="brand-mark">C</span>
          <span className="brand-text">
            CEMS <span>Board</span>
          </span>
        </NavLink>

        <nav className="nav-links">
          <NavLink to="/events" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Events
          </NavLink>
          {user?.role === "student" && (
            <NavLink to="/my-registrations" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              My Registrations
            </NavLink>
          )}
          {(user?.role === "organiser" || user?.role === "administrator") && (
            <>
              <NavLink to="/organiser" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                Organiser
              </NavLink>
              <NavLink to="/organiser/analytics" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
                Analytics
              </NavLink>
            </>
          )}
          {user?.role === "administrator" && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Admin
            </NavLink>
          )}
          {user && (
            <NavLink to="/notifications" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Notifications
            </NavLink>
          )}
        </nav>

        <div className="nav-user">
          {user ? (
            <>
              <span className={`role-tag ${user.role}`}>{user.role}</span>
              <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login" className="btn btn-sm">
              Log in
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
