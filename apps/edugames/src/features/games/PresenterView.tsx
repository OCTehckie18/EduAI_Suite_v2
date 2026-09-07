// EduGames - Presenter View
// The live presentation control panel for the student presenter
// Generates a 6-digit PIN, manages slides, and launches scheduled interactions
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Zap,
  Users,
  Copy,
  CheckCircle,
  Loader2,
  BarChart3,
  MessageSquare,
  Type,
  Cloud,
  Star,
  Eye,
  Maximize,
  Minimize,
  Radio,
  StopCircle,
  ChevronRight,
  AlertCircle,
  Hash,
  Sparkles,
} from "lucide-react";
import PPTXViewer from "./PPTXViewer";
import { API_BASE_URL } from "../../shared/utils/gameAPI";

// ─── Types ────────────────────────────────────────────────────
interface PreloadedInteraction {
  id: number;
  slide_number: number;
  interaction_type: string;
  config: { question: string; options?: string[] };
  order_index: number;
}

interface SessionState {
  session_id: number;
  status: string;
  active_view: string;
  current_slide: number;
  user_type: string;
}

interface Question {
  id: number;
  question_text: string;
  is_anonymous: boolean;
  upvotes: number;
  is_answered: boolean;
  teacher_answer?: string;
  created_at: string;
}

interface Props {
  submissionId: number;
  fileUrl: string;
  fileName: string;
  onBack: () => void;
}

// ─── Constants ────────────────────────────────────────────────
const BRAND_BLUE = "#264796";
const BRAND_BLUE_LIGHT = "#3460c4";

const INTERACTION_ICONS: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  poll_multiple_choice: BarChart3,
  poll_open_text: Type,
  poll_word_cloud: Cloud,
  poll_rating: Star,
  qna_prompt: MessageSquare,
};

const INTERACTION_COLORS: Record<string, string> = {
  poll_multiple_choice: "#2563eb",
  poll_open_text: "#0891b2",
  poll_word_cloud: "#7c3aed",
  poll_rating: "#d97706",
  qna_prompt: "#059669",
};

const INTERACTION_LABELS: Record<string, string> = {
  poll_multiple_choice: "Multiple Choice",
  poll_open_text: "Open Text",
  poll_word_cloud: "Word Cloud",
  poll_rating: "Rating",
  qna_prompt: "Q&A Prompt",
};

// ─── Component ────────────────────────────────────────────────
const PresenterView: React.FC<Props> = ({ submissionId, fileUrl, fileName, onBack }) => {
  // Session state
  const [sessionPin, setSessionPin] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);
  const [audienceCount, setAudienceCount] = useState(0);

  // Interactions
  const [interactions, setInteractions] = useState<PreloadedInteraction[]>([]);
  const [pendingInteraction, setPendingInteraction] = useState<PreloadedInteraction | null>(null);
  const [launchedIds, setLaunchedIds] = useState<Set<number>>(new Set());
  const [currentSlide, setCurrentSlide] = useState(1);

  // Q&A
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQnA, setShowQnA] = useState(false);

  // Session ended
  const [sessionEnded, setSessionEnded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const studentId = localStorage.getItem("student_id") || "1";

  // ─── Fetch Interactions ───────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE_URL}/slido/submissions/${submissionId}/interactions`)
      .then((r) => r.json())
      .then((data) => setInteractions(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [submissionId]);

  // ─── Create Session ───────────────────────────────────────
  const createSession = async () => {
    setCreatingSession(true);
    try {
      // Use teacher_id=1 as fallback since the student initiates the session for their own presentation
      // In production, the teacher would create the session
      const teacherId = localStorage.getItem("teacher_id") || "1";
      const res = await fetch(`${API_BASE_URL}/slido/sessions?teacher_id=${teacherId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });

      if (!res.ok) throw new Error("Failed to create session");

      const session = await res.json();
      setSessionPin(session.pin);
      setSessionId(session.id);
      connectWebSocket(session.pin);
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreatingSession(false);
    }
  };

  // ─── Connect WebSocket ────────────────────────────────────
  const connectWebSocket = (pin: string) => {
    const cleanUrl = API_BASE_URL.trim();
    let wsUrl = "";
    const path = `/ws/slido/${pin}?user_type=presenter&user_id=${studentId}`;
    if (cleanUrl.startsWith("/")) {
      const loc = window.location;
      const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") 
        ? `${loc.hostname}:8000` 
        : loc.host;
      const pathPrefix = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") ? "" : cleanUrl;
      wsUrl = `${protocol}//${wsHost}${pathPrefix}${path}`;
    } else {
      const absUrl = new URL(cleanUrl);
      const wsProtocol = absUrl.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${wsProtocol}//${absUrl.host}${absUrl.pathname === "/" ? "" : absUrl.pathname}${path}`;
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleWSMessage(msg);
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => setConnected(false);

    wsRef.current = ws;
  };

  const handleWSMessage = (msg: any) => {
    switch (msg.type) {
      case "session_state":
        setSessionState(msg);
        setCurrentSlide(msg.current_slide || 1);
        break;
      case "qna_question_asked":
        setQuestions((prev) => [msg.question, ...prev]);
        break;
      case "qna_upvote_updated":
        setQuestions((prev) =>
          prev.map((q) => (q.id === msg.question_id ? { ...q, upvotes: msg.upvotes } : q))
        );
        break;
      case "poll_response_count_update":
        // Visual feedback on responses
        break;
      case "session_ended":
        setSessionEnded(true);
        break;
    }
  };

  const sendMessage = useCallback(
    (type: string, payload: any) => {
      if (wsRef.current && connected) {
        wsRef.current.send(JSON.stringify({ type, ...payload }));
      }
    },
    [connected]
  );

  // ─── Check for pending interaction on slide change ────────
  useEffect(() => {
    if (interactions.length === 0) return;
    const match = interactions.find(
      (i) => i.slide_number === currentSlide && !launchedIds.has(i.id)
    );
    setPendingInteraction(match || null);
  }, [currentSlide, interactions, launchedIds]);

  // ─── Navigation ───────────────────────────────────────────
  const goToSlide = (slideNum: number) => {
    setCurrentSlide(slideNum);
    sendMessage("presentation_state_changed", { current_slide: slideNum });
  };

  const prevSlide = () => goToSlide(Math.max(1, currentSlide - 1));
  const nextSlide = () => goToSlide(currentSlide + 1);

  // ─── Launch Interaction ───────────────────────────────────
  const launchInteraction = (interaction: PreloadedInteraction) => {
    sendMessage("poll_launched", {
      question: interaction.config.question,
      poll_type: interaction.interaction_type.replace("poll_", ""),
      options: interaction.config.options || [],
      interaction_id: interaction.id,
    });
    setLaunchedIds((prev) => new Set([...prev, interaction.id]));
    setPendingInteraction(null);
  };

  // ─── End Session ──────────────────────────────────────────
  const endSession = () => {
    sendMessage("end_session", {});
    setSessionEnded(true);
  };

  // ─── Copy PIN ─────────────────────────────────────────────
  const copyPin = () => {
    if (sessionPin) {
      navigator.clipboard.writeText(sessionPin);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ─── Keyboard Navigation ─────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevSlide();
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === " " && pendingInteraction) {
        e.preventDefault();
        launchInteraction(pendingInteraction);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentSlide, pendingInteraction]);

  // ═════════════════════════════════════════════════════════
  // PRE-SESSION: PIN Generation Screen
  // ═════════════════════════════════════════════════════════
  if (!sessionPin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-500/30">
            <Radio className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-3">Ready to Present?</h1>
          <p className="text-slate-400 mb-2 text-sm">
            Starting a live session will generate a <strong className="text-blue-400">6-digit PIN</strong> that your
            classmates can use to join and interact.
          </p>
          <p className="text-slate-500 text-xs mb-8">
            {interactions.length} interaction{interactions.length !== 1 ? "s" : ""} scheduled on your slides
          </p>

          <button
            onClick={createSession}
            disabled={creatingSession}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-lg text-white transition-all disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})`,
              boxShadow: "0 8px 32px rgba(38,71,150,0.4)",
            }}
          >
            {creatingSession ? (
              <><Loader2 className="w-6 h-6 animate-spin" /> Creating Session...</>
            ) : (
              <><Zap className="w-6 h-6" /> Go Live</>
            )}
          </button>

          <button
            onClick={onBack}
            className="block mx-auto mt-6 text-sm text-slate-500 hover:text-slate-300 transition"
          >
            ← Back to Studio
          </button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // SESSION ENDED
  // ═════════════════════════════════════════════════════════
  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-green-500/30">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-3">Session Complete!</h1>
          <p className="text-slate-400 mb-8">
            Your presentation session has ended. {launchedIds.size} interaction{launchedIds.size !== 1 ? "s were" : " was"} launched.
          </p>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition"
            style={{
              background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})`,
              boxShadow: "0 4px 12px rgba(38,71,150,0.3)",
            }}
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════
  // LIVE PRESENTER VIEW
  // ═════════════════════════════════════════════════════════
  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* ─── Top Bar ──────────────────────────────────────────── */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-700/50 bg-slate-800/80 backdrop-blur-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-bold text-green-400">LIVE</span>
          </div>
          <span className="text-sm text-slate-400 truncate max-w-[200px]">{fileName}</span>
        </div>

        {/* PIN Display */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-700/60 rounded-xl px-4 py-2 border border-slate-600/50">
            <Hash className="w-4 h-4 text-blue-400" />
            <span className="text-lg font-black tracking-[0.3em] text-white">{sessionPin}</span>
            <button
              onClick={copyPin}
              className="p-1 rounded hover:bg-slate-600 transition ml-1"
              title="Copy PIN"
            >
              {pinCopied ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-slate-400 text-sm">
            <Users className="w-4 h-4" />
            <span>{audienceCount}</span>
          </div>

          <button
            onClick={() => setShowQnA(!showQnA)}
            className={`p-2 rounded-lg transition ${showQnA ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-700"}`}
          >
            <MessageSquare className="w-5 h-5" />
            {questions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {questions.length}
              </span>
            )}
          </button>

          <button
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 transition text-sm font-bold"
          >
            <StopCircle className="w-4 h-4" /> End
          </button>
        </div>
      </div>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Presentation Area */}
        <div className="flex-1 flex flex-col">
          {/* Slide Display */}
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-6">
            <div className="w-full h-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl bg-white border border-white/10">
              <PPTXViewer
                fileUrl={fileUrl}
                fileName={fileName}
                title="Your Presentation"
              />
            </div>
          </div>

          {/* ─── Pending Interaction Banner ──────────────────── */}
          {pendingInteraction && (
            <div
              className="px-5 py-3 flex items-center justify-between border-t border-blue-500/30 animate-fade-in"
              style={{
                background: "linear-gradient(135deg, rgba(38,71,150,0.2), rgba(52,96,196,0.15))",
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${INTERACTION_COLORS[pendingInteraction.interaction_type]}20` }}>
                  {(() => {
                    const Icon = INTERACTION_ICONS[pendingInteraction.interaction_type] || BarChart3;
                    return <Icon className="w-5 h-5" style={{ color: INTERACTION_COLORS[pendingInteraction.interaction_type] }} />;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-300">
                      Interaction Ready — Slide {pendingInteraction.slide_number}
                    </span>
                    <span
                      className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: `${INTERACTION_COLORS[pendingInteraction.interaction_type]}20`,
                        color: INTERACTION_COLORS[pendingInteraction.interaction_type],
                      }}
                    >
                      {INTERACTION_LABELS[pendingInteraction.interaction_type]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate max-w-[350px] mt-0.5">
                    {pendingInteraction.config.question}
                  </p>
                </div>
              </div>
              <button
                onClick={() => launchInteraction(pendingInteraction)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition text-white animate-pulse"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})`,
                  boxShadow: "0 4px 16px rgba(38,71,150,0.5)",
                  animationDuration: "2s",
                }}
              >
                <Zap className="w-4 h-4" /> Launch Interaction
              </button>
            </div>
          )}

          {/* ─── Slide Navigation Controls ────────────────────── */}
          <div className="h-16 px-6 flex items-center justify-center gap-6 bg-slate-800 border-t border-slate-700/50 flex-shrink-0">
            <button
              onClick={prevSlide}
              className="p-2.5 hover:bg-slate-700 rounded-xl transition group"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition" />
            </button>

            <div className="flex items-center gap-2 bg-slate-700/50 rounded-xl px-4 py-2">
              <span className="text-lg font-black text-white">{currentSlide}</span>
              <span className="text-xs text-slate-500">/ ∞</span>
            </div>

            <button
              onClick={nextSlide}
              className="p-2.5 hover:bg-slate-700 rounded-xl transition group"
            >
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-white transition" />
            </button>

            {/* Interaction timeline dots */}
            {interactions.length > 0 && (
              <>
                <div className="h-5 w-px bg-slate-700" />
                <div className="flex items-center gap-1.5">
                  {interactions.map((i) => {
                    const launched = launchedIds.has(i.id);
                    const isCurrent = i.slide_number === currentSlide && !launched;
                    return (
                      <button
                        key={i.id}
                        onClick={() => goToSlide(i.slide_number)}
                        className="group relative"
                        title={`Slide ${i.slide_number}: ${i.config.question}`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full transition-all ${
                            launched
                              ? "bg-green-400 scale-100"
                              : isCurrent
                                ? "bg-blue-400 scale-125 ring-4 ring-blue-400/30"
                                : "bg-slate-600 hover:bg-slate-500"
                          }`}
                        />
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                          S{i.slide_number}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Q&A Sidebar (toggle) ───────────────────────────── */}
        {showQnA && (
          <div className="w-80 flex flex-col bg-slate-800 border-l border-slate-700/50">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm">Q&A</span>
                <span className="text-xs text-slate-500">({questions.length})</span>
              </div>
              <button onClick={() => setShowQnA(false)} className="p-1 hover:bg-slate-700 rounded transition">
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {questions.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No questions yet</p>
                  <p className="text-xs text-slate-600 mt-1">Questions from the audience will appear here</p>
                </div>
              ) : (
                questions
                  .sort((a, b) => b.upvotes - a.upvotes)
                  .map((q) => (
                    <div key={q.id} className="bg-slate-700/60 rounded-xl p-3">
                      <p className="text-sm text-white font-medium mb-2">{q.question_text}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">
                          {q.is_anonymous ? "Anonymous" : `Student`}
                        </span>
                        <div className="flex items-center gap-1 text-blue-400 text-xs font-bold">
                          <span>▲</span> {q.upvotes}
                        </div>
                      </div>
                      {q.is_answered && q.teacher_answer && (
                        <div className="mt-2 bg-green-900/30 border-l-2 border-green-400 p-2 rounded text-xs text-green-300">
                          <p className="font-bold text-green-400 mb-0.5">Answered</p>
                          <p>{q.teacher_answer}</p>
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresenterView;
