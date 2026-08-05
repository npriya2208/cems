import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function ManageUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function changeRole(id, role) {
    setBusyId(id);
    try {
      await api.setUserRole(id, role);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(id, name) {
    if (!confirm(`Remove ${name} from the system?`)) return;
    setBusyId(id);
    try {
      await api.deleteUser(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!users) return <div className="spinner-text">{error || "Loading…"}</div>;

  return (
    <div>
      <div className="eyebrow">Administration</div>
      <h1>Manage Users & Roles</h1>
      <p style={{ marginBottom: 20 }}>Add, remove, or modify registered users, per SRS section 2.3.</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.department || "—"}</td>
                <td>
                  <select value={u.role} disabled={busyId === u.id} onChange={(e) => changeRole(u.id, e.target.value)}>
                    <option value="student">Student</option>
                    <option value="organiser">Organiser</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </td>
                <td>
                  {u.id !== me.id && (
                    <button className="btn btn-clay btn-sm" disabled={busyId === u.id} onClick={() => removeUser(u.id, u.name)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
