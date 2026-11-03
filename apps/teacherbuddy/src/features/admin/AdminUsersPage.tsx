import React, { useCallback, useEffect, useState } from "react";
import { Check, Loader, Search, ShieldAlert, X } from "lucide-react";
import { API_BASE_URL } from "../../shared/utils/apiConfig";

interface DirectoryUser {
  id: number;
  name: string;
  email: string;
  role: string;
  register_no: string | null;
  emp_no: string | null;
  is_active: boolean;
}

const GRANTABLE_ROLES = ["STUDENT", "TEACHER"];
const ADMIN_ROLES = ["MASTER_ADMIN"];
const jsonHeaders = (): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
});

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadUsers = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/master-admin/users/?search=${encodeURIComponent(query)}`, {
        headers: jsonHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not load the user directory.");
      setUsers(data.results ?? []);
      setTotal(data.count ?? 0);
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : "Could not load the user directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => loadUsers(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search, loadUsers]);

  const changeRole = async (user: DirectoryUser, role: string) => {
    if (role === user.role) return;
    setSavingId(user.id);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/master-admin/users/${user.id}/`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not change the role.");
      setUsers((current) => current.map((u) => (u.id === user.id ? { ...u, role: data.role ?? role } : u)));
      setFeedback({ type: "success", message: `${user.name} is now ${role.toLowerCase()}.` });
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Could not change the role." });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Access Management
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          New accounts start as students. Grant the teacher role here once a staff member has signed in.
        </p>
      </div>

      <div className="glass-card border p-4 mb-4 rounded-2xl flex items-center gap-3" style={{ borderColor: "var(--color-border)" }}>
        <Search size={16} className="text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, register or employee number"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--color-text-primary)" }}
        />
      </div>

      {feedback && (
        <div
          className={`mb-4 p-3.5 rounded-xl text-xs font-semibold border flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-green-50/50 border-green-200 text-green-700"
              : "bg-red-50/50 border-red-200 text-red-700"
          }`}
        >
          {feedback.type === "success" ? <Check size={14} /> : <X size={14} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="glass-card border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-bold flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: "var(--color-brand-blue)" }} />
            Users ({total})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center text-gray-500">
            <Loader className="animate-spin" size={24} />
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-red-600 font-semibold">{error}</p>
            <button onClick={() => loadUsers(search.trim())} className="mt-4 px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 hover:bg-slate-200">
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-semibold">No users match this search.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: "var(--color-surface-base)", borderBottom: "1px solid var(--color-border)" }}>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Identifier</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {users.map((user) => {
                const locked = ADMIN_ROLES.includes(user.role);
                return (
                  <tr key={user.id}>
                    <td className="p-4">
                      <p className="font-semibold text-sm">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </td>
                    <td className="p-4 text-xs text-gray-500">{user.register_no || user.emp_no || "—"}</td>
                    <td className="p-4 text-right">
                      {locked ? (
                        <span className="px-2 py-1 text-xs font-bold rounded uppercase bg-amber-100 text-amber-700">
                          {user.role.replace("_", " ")}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          disabled={savingId === user.id || !user.is_active}
                          onChange={(e) => changeRole(user, e.target.value)}
                          className="rounded-lg border px-3 py-1.5 text-xs font-bold bg-white text-slate-800 disabled:opacity-50"
                        >
                          {GRANTABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
