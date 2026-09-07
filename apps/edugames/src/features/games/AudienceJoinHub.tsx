// EduGames - Audience Join Hub
// Students enter a 6-digit PIN to join a live presentation session
import React, { useState } from "react";
import { Hash, ArrowRight, Loader2, AlertCircle, Users, Zap, Radio } from "lucide-react";
import LiveSessionInterface from "./LiveSessionInterface";
import { API_BASE_URL } from "../../shared/utils/gameAPI";

const BRAND_BLUE = "#264796";
const BRAND_BLUE_LIGHT = "#3460c4";

const AudienceJoinHub: React.FC = () => {
  const [pin, setPin] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);

  const studentId = parseInt(localStorage.getItem("student_id") || "1");

  const handleJoin = async () => {
    const cleanPin = pin.replace(/\s/g, "");
    if (cleanPin.length !== 6 || !/^\d+$/.test(cleanPin)) {
      setError("Please enter a valid 6-digit PIN");
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/slido/sessions/pin/${cleanPin}`);
      if (!res.ok) {
        throw new Error("Session not found. Please check the PIN and try again.");
      }
      const data = await res.json();
      if (data.status === "ended") {
        throw new Error("This session has already ended.");
      }
      setSessionData(data);
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setJoining(false);
    }
  };

  const handlePinChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    setError(null);
  };

  if (joined && sessionData) {
    return (
      <LiveSessionInterface
        sessionPin={pin}
        studentId={studentId}
        isPresenter={false}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full opacity-10" style={{ background: `radial-gradient(circle, ${BRAND_BLUE}, transparent)` }} />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 rounded-full opacity-8" style={{ background: "radial-gradient(circle, #7c3aed, transparent)" }} />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        {/* Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl" style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})`, boxShadow: `0 12px 40px ${BRAND_BLUE}60` }}>
            <Radio className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Join Live Session</h1>
          <p className="text-slate-400 text-sm">Enter the 6-digit PIN shown by the presenter</p>
        </div>

        {/* PIN Input */}
        <div className="bg-slate-800/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-700/50 shadow-2xl">
          <div className="relative mb-6">
            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="000000"
              maxLength={6}
              className="w-full pl-12 pr-4 py-4 text-center text-3xl font-black tracking-[0.4em] rounded-2xl border-2 transition-all focus:outline-none"
              style={{
                background: "rgba(15,23,42,0.6)",
                borderColor: error ? "#ef4444" : pin.length === 6 ? BRAND_BLUE : "rgba(100,116,139,0.3)",
                color: "#fff",
                letterSpacing: "0.4em",
                caretColor: BRAND_BLUE,
              }}
              autoFocus
            />
            {pin.length > 0 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full transition-all" style={{ background: i < pin.length ? BRAND_BLUE : "rgba(100,116,139,0.3)" }} />
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-xl p-3 mb-4 border border-red-500/20">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={joining || pin.length !== 6}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-lg text-white transition-all disabled:opacity-40"
            style={{
              background: pin.length === 6 ? `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})` : "rgba(100,116,139,0.2)",
              boxShadow: pin.length === 6 ? `0 8px 32px ${BRAND_BLUE}40` : "none",
            }}
          >
            {joining ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Joining...</>
            ) : (
              <><Zap className="w-5 h-5" /> Join Session</>
            )}
          </button>
        </div>

        {/* Help text */}
        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-6 text-slate-500 text-xs">
            <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Real-time polls</div>
            <div className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Live Q&A</div>
            <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Instant results</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudienceJoinHub;
