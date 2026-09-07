import React, { useEffect, useState } from "react";
import { Check, X, ShieldAlert, Loader, Mail, PlusCircle } from "lucide-react";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface PendingUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  picture: string | null;
}

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Whitelist Form States
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const storedToken = localStorage.getItem("token");
      const res = await fetch(`${API_ENDPOINTS.BASE}/admin/pending-approvals`, {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch pending approvals", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const handleWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const storedToken = localStorage.getItem("token");
      const res = await fetch(`${API_ENDPOINTS.BASE}/admin/whitelist-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${storedToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: emailInput.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: "success", message: data.message || "Email successfully whitelisted!" });
        setEmailInput("");
        fetchPendingUsers();
      } else {
        setFeedback({ type: "error", message: data.detail || data.message || "Failed to whitelist email." });
      }
    } catch (err) {
      console.error("Failed to whitelist email", err);
      setFeedback({ type: "error", message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (userId: number, action: "approve" | "deny") => {
    try {
      const storedToken = localStorage.getItem("token");
      const res = await fetch(`${API_ENDPOINTS.BASE}/admin/${action}-user/${userId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${storedToken}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        setUsers(users.filter((u) => u.id !== userId));
      } else {
        alert(`Failed to ${action} user.`);
      }
    } catch (err) {
      console.error(`Failed to ${action} user`, err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Access Management
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Review and approve pending accounts across the EduAI Suite.
          </p>
        </div>
      </div>

      {/* Whitelist Panel */}
      <div 
        className="glass-card border p-6 mb-6 rounded-2xl relative overflow-hidden transition-all duration-300 hover:shadow-lg"
        style={{ 
          borderColor: "var(--color-border)",
          background: "var(--color-surface-card)",
        }}
      >
        <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500 opacity-5 rounded-full blur-2xl pointer-events-none transform translate-x-8 -translate-y-8"></div>
        
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          <ShieldAlert size={18} className="text-blue-500" />
          Pre-approve / Whitelist External Student
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Enter a student's email address (any domain, e.g. Gmail) to manually add them to the student directory in a pending status.
        </p>

        <form onSubmit={handleWhitelist} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail size={16} />
            </span>
            <input
              type="email"
              required
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="student@gmail.com"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border outline-none text-sm transition-all focus:ring-2 focus:ring-blue-500/20"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-bg-base)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary font-bold px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <Loader className="animate-spin" size={16} />
            ) : (
              <PlusCircle size={16} />
            )}
            Whitelist Student
          </button>
        </form>

        {feedback && (
          <div 
            className={`mt-4 p-3.5 rounded-xl text-xs font-semibold border flex items-center gap-2 animate-fade-in ${
              feedback.type === "success" 
                ? "bg-green-50/50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800/30" 
                : "bg-red-50/50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800/30"
            }`}
          >
            {feedback.type === "success" ? <Check size={14} /> : <X size={14} />}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      <div className="glass-card border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-bold flex items-center gap-2">
            <ShieldAlert size={18} style={{ color: "var(--color-brand-blue)" }} />
            Pending Approvals ({users.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center text-gray-500">
            <Loader className="animate-spin" size={24} />
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Check size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-gray-500 font-semibold text-lg">All caught up!</p>
            <p className="text-sm text-gray-400">No pending accounts await your approval.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: "var(--color-surface-base)", borderBottom: "1px solid var(--color-border)" }}>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/5 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="p-4 flex items-center gap-3">
                    {user.picture ? (
                      <img src={user.picture} alt="" className="w-10 h-10 rounded-full bg-gray-100" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${user.role === "teacher" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => handleAction(user.id, "approve")}
                      className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <Check size={14} /> Approve
                      </span>
                    </button>
                    <button
                      onClick={() => handleAction(user.id, "deny")}
                      className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <X size={14} /> Deny
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
