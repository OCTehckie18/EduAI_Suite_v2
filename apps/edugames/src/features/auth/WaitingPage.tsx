import React, { useState } from "react";
import { Clock, Loader, LogOut, ShieldX } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/logo (5).png";
import { supabase } from "../../lib/supabase";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

export const WaitingPage: React.FC = () => {
  const { status, user, token, googleLogin, logout } = useAuthStore();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleCheckAgain = async () => {
    setChecking(true);
    setError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || token || localStorage.getItem("token");
      if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch(`${API_ENDPOINTS.AUTH}/supabase-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to check your approval status.");

      googleLogin(accessToken, data.user, data.user.role || "student", data.status);
      if (data.status === "approved") navigate("/");
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Unable to check your approval status.");
    } finally {
      setChecking(false);
    }
  };

  const isDenied = status === "denied";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--color-bg-start)" }}
    >
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="glass-card p-8 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-lg">
              <img src={logo} alt="Christ University" className="w-full h-full object-contain" />
            </div>
            <div className="text-left">
              <p className="font-black text-sm" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
                EduGames
              </p>
              <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                Christ University
              </p>
            </div>
          </div>

          {/* Icon */}
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{
              background: isDenied
                ? "rgba(239,68,68,0.1)"
                : "rgba(234,179,8,0.1)",
            }}
          >
            {isDenied ? (
              <ShieldX size={36} style={{ color: "#ef4444" }} />
            ) : (
              <Clock size={36} style={{ color: "#eab308" }} />
            )}
          </div>

          {/* Title */}
          <h2
            className="text-2xl font-black mb-2"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-text-primary)",
            }}
          >
            {isDenied ? "Access Denied" : "Waiting for Approval"}
          </h2>

          {/* Description */}
          <p
            className="text-sm mb-6 leading-relaxed"
            style={{ color: "var(--color-text-muted)" }}
          >
            {isDenied ? (
              <>
                Your account has been denied access. If you believe this is an
                error, please contact your administrator.
              </>
            ) : (
              <>
                Your account <strong style={{ color: "var(--color-text-secondary)" }}>{user?.email}</strong> has been
                registered successfully. An administrator will review and
                approve your access shortly.
              </>
            )}
          </p>

          {error && (
            <p className="mb-4 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {/* User info card */}
          {user && (
            <div
              className="p-4 rounded-xl mb-6 flex items-center gap-3"
              style={{
                background: "var(--color-bg-grad1)",
                border: "1px solid var(--color-border)",
              }}
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-10 h-10 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{
                    background: "var(--color-brand-blue)",
                    color: "white",
                  }}
                >
                  {user.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
              <div className="text-left">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {user.name}
                </p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {user.email}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {!isDenied && (
              <button
                onClick={handleCheckAgain}
                disabled={checking}
                className="btn btn-primary w-full py-3 text-sm font-bold"
              >
                {checking ? <Loader size={16} className="mx-auto animate-spin" /> : "Check Again"}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="btn btn-ghost w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              <LogOut size={15} /> Sign out and use a different account
            </button>
          </div>

          {/* Contact */}
          <div className="mt-6 pt-5 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Need help? Contact{" "}
              <a
                href="mailto:it@christuniversity.in"
                className="font-semibold"
                style={{ color: "var(--color-brand-blue)" }}
              >
                it@christuniversity.in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
