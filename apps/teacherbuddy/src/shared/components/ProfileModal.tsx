import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { API_ENDPOINTS } from "../utils/apiConfig";
import { useRules } from "../university";

interface HierarchyItem {
  id: number;
  name: string;
}

interface ProfileUser {
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  register_no?: string | null;
  emp_no?: string | null;
  phone_number?: string;
  hierarchy?: Record<string, HierarchyItem | null>;
  [key: string]: unknown;
}

interface ProfileModalProps {
  onClose: () => void;
  onSaved: (user: ProfileUser) => void;
}

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
});

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose, onSaved }) => {
  const studentRules = useRules().accounts.student_can_edit;
  const studentProfile = (role?: string) => role === "student";
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone_number: "", register_no: "", emp_no: "", password: "", current_password: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_ENDPOINTS.AUTH}/me/`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not load profile.");
        setProfile(data.user);
        setForm({
          first_name: data.user.first_name ?? "",
          last_name: data.user.last_name ?? "",
          phone_number: data.user.phone_number ?? "",
          register_no: data.user.register_no ?? "",
          emp_no: data.user.emp_no ?? "",
          password: "",
          current_password: "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load profile.");
      }
    })();
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = studentProfile(profile?.role);
    const canEditName = !student || studentRules.name;
    const canEditPhone = !student || studentRules.phone;
    const canEditPassword = !student || studentRules.password;
    setSaving(true);
    setError("");
    setMessage("");
    const { password, current_password, register_no, emp_no, ...fields } = form;
    const body: Record<string, string> = { ...fields };
    // Leave out what the university does not let students change, so the rest still saves.
    if (!canEditName) { delete body.first_name; delete body.last_name; }
    if (!canEditPhone) delete body.phone_number;
    // Identifiers are fixed once set; only an administrator can change them.
    if (!profile?.register_no && register_no) body.register_no = register_no;
    if (!profile?.emp_no && emp_no) body.emp_no = emp_no;
    if (password && canEditPassword) {
      body.password = password;
      body.current_password = current_password;
    }
    try {
      const res = await fetch(`${API_ENDPOINTS.AUTH}/me/`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not save changes.");
      setProfile(data.user);
      setForm((f) => ({ ...f, password: "", current_password: "" }));
      setMessage("Profile updated.");
      onSaved(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const isStudent = profile?.role === "student";
  const isTeacher = profile?.role === "teacher";
  const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white text-slate-800";
  const hierarchy = Object.entries(profile?.hierarchy ?? {}).filter(([, v]) => v);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">My Profile</h2>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!profile && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {profile && (
          <>
            <label className="block text-xs font-semibold text-slate-500">Email
              <input className={`${inputClass} mt-1 bg-slate-50`} value={profile.email} disabled />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">First name
                <input className={`${inputClass} mt-1 disabled:opacity-60`} value={form.first_name} onChange={set("first_name")} disabled={isStudent && !studentRules.name} />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Last name
                <input className={`${inputClass} mt-1 disabled:opacity-60`} value={form.last_name} onChange={set("last_name")} disabled={isStudent && !studentRules.name} />
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-500">Phone number
              <input className={`${inputClass} mt-1 disabled:opacity-60`} value={form.phone_number} onChange={set("phone_number")} disabled={isStudent && !studentRules.phone} />
            </label>
            {isStudent && (
              <label className="block text-xs font-semibold text-slate-500">Register number
                <input className={`${inputClass} mt-1`} value={form.register_no} onChange={set("register_no")} disabled={Boolean(profile.register_no)} />
              </label>
            )}
            {isTeacher && (
              <label className="block text-xs font-semibold text-slate-500">Employee number
                <input className={`${inputClass} mt-1`} value={form.emp_no} onChange={set("emp_no")} disabled={Boolean(profile.emp_no)} />
              </label>
            )}
            {!(isStudent && !studentRules.password) && <label className="block text-xs font-semibold text-slate-500">New password (leave blank to keep current)
              <input type="password" minLength={6} className={`${inputClass} mt-1`} value={form.password} onChange={set("password")} autoComplete="new-password" />
            </label>}
            {isStudent && (!studentRules.name || !studentRules.phone || !studentRules.password) && (
              <p className="text-xs text-slate-500">Some details can only be changed by your university's administration.</p>
            )}
            {form.password && (
              <label className="block text-xs font-semibold text-slate-500">Current password
                <input type="password" required className={`${inputClass} mt-1`} value={form.current_password} onChange={set("current_password")} autoComplete="current-password" />
              </label>
            )}
            {hierarchy.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                {hierarchy.map(([key, v]) => (
                  <p key={key}><span className="font-semibold capitalize">{key}:</span> {v!.name}</p>
                ))}
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100">Close</button>
          <button type="submit" disabled={!profile || saving} className="px-4 py-2 text-sm rounded-lg bg-blue-700 text-white font-semibold disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
};
