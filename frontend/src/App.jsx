import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import EventsBrowse from "./pages/EventsBrowse";
import EventDetail from "./pages/EventDetail";
import MyRegistrations from "./pages/MyRegistrations";
import Notifications from "./pages/Notifications";
import OrganiserDashboard from "./pages/OrganiserDashboard";
import ManageEvent from "./pages/ManageEvent";
import Analytics from "./pages/Analytics";
import AdminDashboard from "./pages/AdminDashboard";
import ManageUsers from "./pages/ManageUsers";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/events" element={<EventsBrowse />} />
          <Route path="/events/:id" element={<EventDetail />} />

          <Route path="/my-registrations" element={
            <ProtectedRoute roles={["student"]}><MyRegistrations /></ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute><Notifications /></ProtectedRoute>
          } />

          <Route path="/organiser" element={
            <ProtectedRoute roles={["organiser", "administrator"]}><OrganiserDashboard /></ProtectedRoute>
          } />
          <Route path="/organiser/events/:id" element={
            <ProtectedRoute roles={["organiser", "administrator"]}><ManageEvent /></ProtectedRoute>
          } />
          <Route path="/organiser/analytics" element={
            <ProtectedRoute roles={["organiser", "administrator"]}><Analytics /></ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute roles={["administrator"]}><AdminDashboard /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute roles={["administrator"]}><ManageUsers /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/events" replace />} />
        </Routes>
      </main>
      <footer className="footer-note">College Event Management System — built from the CEMS SRS &amp; UML design</footer>
    </div>
  );
}
