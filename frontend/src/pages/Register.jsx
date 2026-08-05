import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "student", department: "", roll_no: "", contact_no: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/events");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="eyebrow">Register on portal</div>
      <h1>Create your account</h1>
      <p style={{ marginBottom: 20 }}>Join CEMS as a student, organiser, or administrator.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div className="field">
          <label>Full name</label>
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" required minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={(e) => update("role", e.target.value)}>
            <option value="student">Student</option>
            <option value="organiser">Organiser (Faculty Coordinator / Club Head)</option>
            <option value="administrator">Administrator</option>
          </select>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Department</label>
            <input value={form.department} onChange={(e) => update("department", e.target.value)} />
          </div>
          {form.role === "student" && (
            <div className="field">
              <label>Roll No.</label>
              <input value={form.roll_no} onChange={(e) => update("roll_no", e.target.value)} />
            </div>
          )}
        </div>
        <div className="field">
          <label>Contact No.</label>
          <input value={form.contact_no} onChange={(e) => update("contact_no", e.target.value)} />
        </div>
        <button className="btn btn-block btn-amber" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: "0.88rem" }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
