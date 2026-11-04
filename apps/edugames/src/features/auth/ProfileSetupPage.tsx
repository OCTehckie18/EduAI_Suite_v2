import React, { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Loader, LogOut, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "../../../../logo/eduai_logo.png";
import { useAuthStore } from "../../store/useAuthStore";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { logoSrc, useUniversity } from "../../shared/university";

interface Admission {
  matched: boolean | null;
  register_no?: string;
  name?: string;
  message?: string;
  placement?: Record<string, string>;
}

const PLACEMENT_LABELS: [string, string][] = [
  ["campus", "Campus"],
  ["school", "School"],
  ["department", "Department"],
  ["program", "Program"],
  ["batch", "Class"],
  ["section", "Section"],
];

const inputClass = "rounded-xl border border-slate-200 px-3 py-3 font-normal";

export const ProfileSetupPage: React.FC = () => {
  const uni = useUniversity();
  const navigate = useNavigate();
  const { googleLogin, logout } = useAuthStore();
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);
  const token = localStorage.getItem("token");
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [form, setForm] = useState({ phone_number: "", password: "", confirm_password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    (async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.AUTH}/profile/setup/`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not load your admission details.");
        setAdmission(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your admission details.");
      }
    })();
  }, [navigate, token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.AUTH}/profile/setup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone_number: form.phone_number, password: form.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to complete registration.");
      localStorage.setItem("refresh_token", data.refresh ?? localStorage.getItem("refresh_token") ?? "");
      googleLogin(data.access, data.user, data.user.role || "student", data.status);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete registration.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const header = (
    <div className="flex items-center gap-3">
      <img src={logoSrc(uni) ?? logo} alt={uni.name || "EduAI Suite"} className="h-12 w-12 rounded-xl bg-white p-1" />
      <div>
        <h1 className="text-2xl font-black">Complete your registration</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{user.email || "Google account"} · Student profile</p>
      </div>
    </div>
  );

  if (admission && admission.matched === false) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--color-bg-start)" }}>
        <div className="glass-card w-full max-w-lg space-y-5 p-8">
          {header}
          <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600">
            {admission.message || "Your email is not on the admitted-students list. Please contact your department office."}
          </p>
          <button onClick={signOut} className="btn btn-ghost flex w-full items-center justify-center gap-2 py-3 font-semibold">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--color-bg-start)" }}>
      <form onSubmit={submit} className="glass-card w-full max-w-2xl space-y-5 p-8">
        {header}
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          These details come from your admission record and cannot be edited. Set a password for future sign-ins.
        </p>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</p>}
        {!admission && !error && <p className="text-sm text-slate-500">Loading your admission details…</p>}
        {admission?.matched && (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white/60 p-4 text-sm sm:grid-cols-2">
            <p><span className="font-semibold">Registration number:</span> {admission.register_no}</p>
            {admission.name && <p><span className="font-semibold">Name:</span> {admission.name}</p>}
            {PLACEMENT_LABELS.map(([key, label]) => admission.placement?.[key] && (
              <p key={key}><span className="font-semibold">{label}:</span> {admission.placement[key]}</p>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">Phone number
            <input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} className={inputClass} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">Password
            <input required minLength={6} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} autoComplete="new-password" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">Confirm password
            <input required minLength={6} type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} className={inputClass} autoComplete="new-password" />
          </label>
        </div>
        <button disabled={loading || !admission?.matched} className="btn btn-primary flex w-full items-center justify-center gap-2 py-3 font-bold">
          {loading ? <Loader size={18} className="animate-spin" /> : <Save size={18} />} {loading ? "Saving registration..." : "Complete registration"}
        </button>
      </form>
    </main>
  );
};
