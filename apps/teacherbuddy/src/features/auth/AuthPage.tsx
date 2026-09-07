import React, { useState, useEffect } from "react";
import { Loader } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import logo from "../../assets/logo (5).png";
import { useAuthStore } from "../../store/useAuthStore";
import { supabase } from "../../lib/supabase";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

export const AuthPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: credential,
      });
      if (authError || !authData.session) {
        throw authError || new Error("Supabase did not return a session");
      }

      const res = await fetch(`${API_ENDPOINTS.AUTH}/supabase-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authData.session.access_token}` },
      });

      const data = await res.json();

      if (res.ok) {
        // Enforce app-specific role restrictions
        if (data.user.role !== "teacher" && data.user.role !== "admin") {
          setError("Access Denied: This portal is strictly for Teachers and Administrators.");
          setLoading(false);
          return;
        }

        googleLogin(
          authData.session.access_token,
          data.user,
          data.status
        );

        if (data.status === "approved") {
          if (data.user.role === "admin") {
            window.location.href = "/admin/users";
          } else {
            window.location.href = "/";
          }
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

  return (
    <div className="min-h-screen flex w-full">
      {/* ── Left Panel ── */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0f1e45 0%,#1c3570 50%,#264796 100%)" }}>
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full" style={{ background: "rgba(208,174,97,0.08)" }} />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full" style={{ background: "rgba(38,71,150,0.25)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full" style={{ background: "rgba(255,255,255,0.02)" }} />

        {/* Logo */}
        <div>
          <div className="flex items-center gap-4 mb-12">
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-xl p-1.5">
              <img src={logo} alt="Christ University" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-white font-black text-xl tracking-tight" style={{ fontFamily: "var(--font-display)" }}>TeacherBuddy</p>
              <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-brand-gold)" }}>
                Christ (Deemed to be University)
              </p>
            </div>
          </div>

          <h1 className="text-4xl font-black text-white leading-tight mb-4" style={{ fontFamily: "var(--font-display)" }}>
            Empowering<br />
            <span style={{ color: "var(--color-brand-gold)" }}>Educators.</span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            AI-powered academic management and insight tools for faculty and administrators at Christ University.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-4 relative">
          {[
            { mark: "AI", title: "AI Evaluation", desc: "Automated subjective answer scoring with teacher review" },
            { mark: "RD", title: "Risk Detection", desc: "Early warning system for student dropout risk" },
            { mark: "LA", title: "Live Analytics", desc: "Real-time performance dashboards and trend analysis" },
            { mark: "CS", title: "Content Studio", desc: "AI-generated lesson plans and interactive quizzes" },
          ].map(f => (
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

        <p className="text-white/30 text-xs">
          © 2026 Christ (Deemed to be University) · Excellence · Service · Knowledge
        </p>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: "var(--color-bg-start)" }}>
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="glass-card p-8">
            {/* Mobile Logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1">
                <img src={logo} alt="Christ University" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="font-black text-sm" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>TeacherBuddy</p>
                <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Christ University</p>
              </div>
            </div>

            <h2 className="text-2xl font-black mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
              Faculty Portal
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
              Sign in with your university Google account.
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
                {/* Google Sign-In Button */}
                <div className="w-full flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google Sign-In failed. Please try again.")}
                    theme="outline"
                    size="large"
                    width="350"
                    text="signin_with"
                    shape="rectangular"
                  />
                </div>

                <p className="text-xs text-center mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Use your <strong>@christuniversity.in</strong> email to sign in
                </p>

              </div>
            )}

            <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Having trouble? Contact{" "}
                <a href="mailto:it@christuniversity.in" className="font-semibold" style={{ color: "var(--color-brand-blue)" }}>
                  it@christuniversity.in
                </a>
              </p>
            </div>
          </div>

          {/* SSD info */}
          <p className="text-center text-xs mt-6" style={{ color: "var(--color-text-muted)" }}>
            Secured with TLS 1.3 · Google OAuth 2.0 · Admin Approval
          </p>
        </div>
      </div>
    </div>
  );
};
