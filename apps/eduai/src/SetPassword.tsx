import { FormEvent, useState } from "react";
import logo from "../../logo/eduai_logo.png";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { logoSrc, logoVariant, useUniversity } from "./shared/university";
import { inputClass } from "./ui";

/** Where a new Master Admin lands from the emailed link: choose a password once, then sign in. */
export function SetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const university = useUniversity();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== again) return setError("The two passwords do not match.");
    setBusy(true);
    setError("");
    try {
      await requestJson(`${API_BASE_URL}/vendor/set-password/`, { method: "POST", body: JSON.stringify({ token, password }) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          <img src={logoSrc(university) ?? logo} data-variant={logoVariant(university)} alt={university.name || "EduAI Suite"} className="logo-tile h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1.5" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{university.name || "EduAI Suite"}</h1>
            <p className="text-sm text-slate-500">Set your Master Admin password</p>
          </div>
        </div>
        {saved ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Password set. You can sign in now.</p>
            <button type="button" onClick={onDone} className="w-full rounded-lg bg-brand-blue px-4 py-2.5 font-semibold text-white">Go to sign in</button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium">New password
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm font-medium">Repeat the password
              <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand-blue px-4 py-2.5 font-semibold text-white disabled:opacity-60">
              {busy ? "Saving..." : "Set password"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
