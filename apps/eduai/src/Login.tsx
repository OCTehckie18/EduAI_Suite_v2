import { landingUrl } from "./shared/landingUrl";
import { FormEvent, useState } from "react";
import logo from "../../logo/eduai_logo.png";
import { API_ENDPOINTS } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { logoSrc, logoVariant, portalName, signInBackground, signInPage, siteLinks, useUniversity, termsOf } from "./shared/university";
import { AdminUser } from "./types";
import { inputClass } from "./ui";

export function LoginScreen({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const university = useUniversity();
  const t = termsOf(university);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const universityLogo = logoSrc(university);
  const page = signInPage(university, "master_admin");
  const appName = portalName(university, "master_admin", "Master Admin");
  const links = siteLinks(university);
  // Master Admin keeps its plain page unless the university chose a colour or an image for it.
  const pageStyle = page.background.kind === "brand" ? undefined : { background: signInBackground(page) };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError(`Enter your email or ${t("employee_no", { lower: true })}, and your password.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<{ access: string; refresh?: string; user: AdminUser }>(`${API_ENDPOINTS.AUTH}/login/`, {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (data.user.role_code !== "MASTER_ADMIN") {
        throw new Error("Access denied. Master Admin privileges are required.");
      }
      localStorage.setItem("token", data.access);
      localStorage.setItem("refresh_token", data.refresh ?? "");
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("lastActivity", Date.now().toString());
      onLogin(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900" style={pageStyle}>
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-8 flex items-center gap-4">
          <img src={universityLogo ?? logo} data-variant={logoVariant(university)} alt={university.name || "EduAI Suite"} className="logo-tile h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1.5" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{university.name || "EduAI Suite"}</h1>
            <p className="text-sm text-slate-500">{appName} · sign in to continue</p>
          </div>
        </div>
        {(page.headline || page.text) && <div className="mb-6">
          {page.headline && <p className="text-base font-semibold text-slate-900">{page.headline}</p>}
          {page.text && <p className="mt-1 text-sm text-slate-600">{page.text}</p>}
        </div>}
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <label className="mb-4 block text-sm text-slate-700">Email or {t('employee_no', { lower: true })}
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus className={`${inputClass} mt-2 px-4 py-3`} />
        </label>
        <label className="mb-6 block text-sm text-slate-700">Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className={`${inputClass} mt-2 px-4 py-3`} />
        </label>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-blue px-4 py-3 font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50">{loading ? "Signing in..." : "Sign in"}</button>
        {university.contact_email && <p className="mt-5 text-center text-xs text-slate-500">Need help? <a href={`mailto:${university.contact_email}`} className="text-slate-700 underline">{university.contact_email}</a></p>}
        <p className="mt-3 flex flex-wrap justify-center gap-3 text-center text-xs text-slate-500">
          <a href={landingUrl()} className="text-slate-700 underline">All portals</a>
          {links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" className="text-slate-700 underline">{label}</a>)}
        </p>
        {page.motto && <p className="mt-3 text-center text-xs text-slate-500">{page.motto}</p>}
      </form>
    </div>
  );
}
