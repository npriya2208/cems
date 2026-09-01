import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/events");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(role) {
    const creds = {
      student: "student@cems.edu",
      organiser: "organiser@cems.edu",
      administrator: "admin@cems.edu",
    };
    setEmail(creds[role]);
    setPassword("password123");
  }

  return (
    <div className="auth-wrap">
      <div className="eyebrow">Welcome back</div>
      <h1>Log in to CEMS</h1>
      <p style={{ marginBottom: 20 }}>Access your dashboard for events, registrations, and notices.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-block btn-amber" type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div style={{ marginTop: 16, fontSize: "0.82rem" }}>
        <p style={{ marginBottom: 6 }}>Try a demo account (password: password123):</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fillDemo("student")}>Student</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fillDemo("organiser")}>Organiser</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fillDemo("administrator")}>Admin</button>
        </div>
      </div>

      <p style={{ marginTop: 20, fontSize: "0.88rem" }}>
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
