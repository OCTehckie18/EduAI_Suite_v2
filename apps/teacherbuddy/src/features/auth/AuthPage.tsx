import { landingUrl } from "../../shared/utils/landingUrl";
import React, { useState, useEffect } from "react";
import { Loader } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import logo from "../../../../logo/eduai_logo.png";
import { useAuthStore } from "../../store/useAuthStore";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { logoSrc, logoVariant, portalName, rulesOf, signInBackground, signInPage, siteLinks, useUniversity } from "../../shared/university";

export const AuthPage: React.FC = () => {
  const uni = useUniversity();
  const page = signInPage(uni, "teacherbuddy");
  const appName = portalName(uni, "teacherbuddy", "TeacherBuddy");
  const links = siteLinks(uni);
  const signin = rulesOf(uni).signin;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { googleLogin, logout } = useAuthStore();

  useEffect(() => {
    logout();
  }, [logout]);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    const credential = credentialResponse.credential;
    if (!credential) {
      setError("No credential received from Google.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_ENDPOINTS.AUTH}/google/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: credential, app: "teacherbuddy" }),
      });

      const data = await res.json();

      if (res.ok) {
        // Enforce app-specific role restrictions
        if (data.user.role !== "teacher") {
          setError("Access Denied: This portal is for faculty. Students use EduGames and administrators use the Master Admin portal.");
          setLoading(false);
          return;
        }

        localStorage.setItem("refresh_token", data.refresh ?? "");
      googleLogin(data.access, data.user, data.status);

        if (!data.user.is_profile_complete) {
          window.location.href = "/profile/setup";
        } else if (data.status === "approved") {
          window.location.href = "/";
        } else {
          window.location.href = "/waiting";
        }
      } else {
        setError(data.detail || "Authentication failed. Please try again.");
      }
    } catch (err) {
      console.error("Google login failed:", err);
      setError("Server connection failed. Please ensure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your employee number or email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_ENDPOINTS.AUTH}/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Invalid employee number or password.");
      }

      if (data.user.role !== "teacher") {
        throw new Error("Access Denied: This portal is for faculty. Students use EduGames and administrators use the Master Admin portal.");
      }

      localStorage.setItem("refresh_token", data.refresh ?? "");
      googleLogin(data.access, data.user, data.status);

      if (!data.user.is_profile_complete) {
        window.location.href = "/profile/setup";
      } else if (data.status === "approved") {
        window.location.href = "/";
      } else {
        window.location.href = "/waiting";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full">
      {/* ── Left Panel ── */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden" style={{ background: signInBackground(page) }}>
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full" style={{ background: "color-mix(in srgb, var(--color-brand-gold) 8%, transparent)" }} />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full" style={{ background: "color-mix(in srgb, var(--color-brand-blue) 25%, transparent)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full" style={{ background: "rgba(255,255,255,0.02)" }} />

        {/* Logo */}
        <div>
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 rounded-2xl logo-tile bg-white flex items-center justify-center shadow-xl p-1.5">
              <img src={logoSrc(uni) ?? logo} data-variant={logoVariant(uni)} alt={uni.name || "EduAI Suite"} className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-white font-black text-xl tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{appName}</p>
              <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-brand-gold)" }}>
                {uni.name || "EduAI Suite"}
              </p>
            </div>
          </div>

          {page.headline ? <h1 className="text-4xl font-black text-white leading-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>{page.headline}</h1> : (
          <h1 className="text-4xl font-black text-white leading-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
            Empowering<br />
            <span style={{ color: "var(--color-brand-gold)" }}>Educators.</span>
          </h1>
          )}
          {page.text ? <p className="text-white/70 text-base leading-relaxed max-w-sm">{page.text}</p> : (
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            AI-powered academic management and insight tools for faculty and administrators{uni.name ? ` at ${uni.name}` : ""}.
          </p>
          )}
        </div>

        {/* Feature Highlights */}
        <div className="space-y-4 relative">
          {(page.highlights.length ? page.highlights.map((h) => ({ mark: h.title.slice(0, 2).toUpperCase(), title: h.title, desc: h.text })) : [
            { mark: "AI", title: "AI Evaluation", desc: "Automated subjective answer scoring with teacher review" },
            { mark: "RD", title: "Risk Detection", desc: "Early warning system for student dropout risk" },
            { mark: "LA", title: "Live Analytics", desc: "Real-time performance dashboards and trend analysis" },
            { mark: "CS", title: "Content Studio", desc: "AI-generated lesson plans and interactive quizzes" },
          ]).map(f => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                {f.mark}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-white/50 text-xs mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-white/50 text-xs">
            © {new Date().getFullYear()} {uni.name || "EduAI Suite"}{page.motto ? ` · ${page.motto}` : ""}
          </p>
          {links.length > 0 && <p className="flex flex-wrap gap-3 text-xs">{links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" className="text-white/70 underline hover:text-white">{label}</a>)}</p>}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 min-w-0 flex items-center justify-center p-4 sm:p-6" style={{ background: "var(--color-bg-start)" }}>
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="glass-card p-5 sm:p-8">
            {/* Mobile Logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-10 h-10 rounded-xl logo-tile bg-white flex items-center justify-center p-1">
                <img src={logoSrc(uni) ?? logo} data-variant={logoVariant(uni)} alt={uni.name || "EduAI Suite"} className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="font-black text-sm" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>{appName}</p>
                <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{uni.name || "EduAI Suite"}</p>
              </div>
            </div>

            <h2 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
              Faculty Portal
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
              Sign in with Google or your saved employee number and password.
            </p>

            {error && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6" style={{ color: "var(--color-text-muted)" }}>
                <Loader size={20} className="animate-spin" />
                <span className="text-sm font-semibold">Signing you in…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {signin.methods !== "password" && <>
                {/* Google Sign-In Button */}
                <div className="w-full flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google Sign-In failed. Please try again.")}
                    theme="outline"
                    size="large"
                    width={String(Math.min(350, Math.max(200, window.innerWidth - 72)))}
                    text="signin_with"
                    shape="rectangular"
                  />
                </div>

                </>}
                {(signin.allowed_domains.length > 0 || uni.email_domain) && (
                  <p className="text-xs text-center mt-1" style={{ color: "var(--color-text-muted)" }}>
                    Use your <strong>{signin.allowed_domains.length ? signin.allowed_domains.map((d) => `@${d}`).join(" or ") : `@${uni.email_domain}`}</strong> email to sign in
                  </p>
                )}

                {signin.methods === "both" && <>
                <div className="w-full flex items-center gap-3 my-1">
                  <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>or use saved credentials</span>
                  <div className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                </div>

                </>}

                {signin.methods !== "google" && (
                <form onSubmit={handlePasswordLogin} className="w-full space-y-3">
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Employee number or email"
                    autoComplete="username"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-bg-start)", color: "var(--color-text-primary)" }}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-bg-start)", color: "var(--color-text-primary)" }}
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: "var(--color-brand-blue-fill)" }}
                    disabled={loading}
                  >
                    Sign in with password
                  </button>
                </form>
                )}

              </div>
            )}

            {uni.contact_email && (
              <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Having trouble? Contact{" "}
                  <a href={`mailto:${uni.contact_email}`} className="font-semibold" style={{ color: "var(--color-brand-blue)" }}>
                    {uni.contact_email}
                  </a>
                </p>
              </div>
            )}
          </div>

          <p className="text-center text-xs mt-6" style={{ color: "var(--color-text-muted)" }}>
            Looking for another portal?{" "}
            <a href={landingUrl()} className="font-semibold hover:underline" style={{ color: "var(--color-brand-blue)" }}>
              All portals
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
