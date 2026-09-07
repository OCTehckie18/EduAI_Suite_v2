import React, { useEffect, useState } from "react";
import { GlassCard } from "../../shared/components/GlassCard";
import { Trash2, Play, History, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface GameSession {
  id: string | number;
  type: "chain-answer" | "wordcloud" | "quiz" | "quiz-template";
  title: string;
  status: string;
  created_at?: string;
  session_id?: string;
  pin?: string;
  question_count?: number;
}

interface GamesHistoryListProps {
  onRejoinGame: (type: string, id: number | string, sessionId: string) => void;
}

export const GamesHistoryList: React.FC<GamesHistoryListProps> = ({ onRejoinGame }) => {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const results: GameSession[] = [];

      // Fetch Quizzes (Drafts and Templates)
      try {
        const qzRes = await fetch(`${API_BASE_URL}/quizzes/`);
        if (qzRes.ok) {
          const qzData = await qzRes.json();
          qzData.forEach((quiz: any) => {
            results.push({
              id: quiz.id,
              type: "quiz-template",
              title: quiz.title,
              status: quiz.is_draft ? "draft" : "published",
              created_at: quiz.created_at,
              question_count: quiz.question_count
            });
          });
        }
      } catch (err) {
        console.warn("Could not fetch Quiz templates", err);
      }

      // Fetch Chain Answer games
      try {
        const caRes = await fetch(`${API_BASE_URL}/games/chain-answer`);
        if (caRes.ok) {
          const caData = await caRes.json();
          caData.forEach((game: any) => {
            results.push({
              id: game.id,
              type: "chain-answer",
              title: game.name || "Chain Answer Game",
              status: game.status,
              session_id: game.session_id,
            });
          });
        }
      } catch (err) {
        console.warn("Could not fetch Chain Answer games", err);
      }

      // Fetch Word Cloud sessions
      try {
        const wcRes = await fetch(`${API_BASE_URL}/wordcloud/`);
        if (wcRes.ok) {
          const wcData = await wcRes.json();
          wcData.forEach((game: any) => {
            results.push({
              id: game.pin, // using pin as id for deletion
              type: "wordcloud",
              title: game.prompt || "Word Cloud Session",
              status: game.status,
              pin: game.pin,
            });
          });
        }
      } catch (err) {
        console.warn("Could not fetch Word Cloud sessions", err);
      }

      // Fetch Quiz sessions (Active games)
      try {
        const qRes = await fetch(`${API_BASE_URL}/quizzes/sessions`);
        if (qRes.ok) {
          const qData = await qRes.json();
          qData.forEach((game: any) => {
            results.push({
              id: game.pin,
              type: "quiz",
              title: game.quiz_title || "Quiz Session",
              status: game.status,
              pin: game.pin,
            });
          });
        }
      } catch (err) {
        console.warn("Could not fetch Quiz sessions", err);
      }

      setSessions(results);
    } catch (err) {
      setError("Failed to load game history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (type: string, id: string | number) => {
    if (!window.confirm("Are you sure you want to delete this?")) return;

    try {
      let endpoint = "";
      if (type === "chain-answer") {
        endpoint = `${API_BASE_URL}/games/chain-answer/${id}`;
      } else if (type === "wordcloud") {
        endpoint = `${API_BASE_URL}/wordcloud/${id}`;
      } else if (type === "quiz") {
        endpoint = `${API_BASE_URL}/quizzes/sessions/${id}`;
      } else if (type === "quiz-template") {
        endpoint = `${API_BASE_URL}/quizzes/${id}`;
      }

      const res = await fetch(endpoint, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id || s.type !== type));
      } else {
        alert("Failed to delete.");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting.");
    }
  };

  const handlePlayTemplate = async (quizId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/quizzes/${quizId}/session`, {
        method: "POST"
      });
      if (res.ok) {
        const session = await res.json();
        onRejoinGame("quiz", quizId, session.pin);
      }
    } catch (err) {
      console.error("Failed to start session", err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--color-brand-blue)" }} />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center p-8" style={{ color: "var(--color-text-secondary)" }}>
        <History size={48} className="mx-auto mb-4 opacity-50" />
        <p>No active or past games found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session, idx) => (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
          key={`${session.type}-${session.id}`}
        >
          <GlassCard className="p-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
                  {session.title}
                </h3>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${
                    session.status === "active" || session.status === "lobby"
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : session.status === "draft"
                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                      : "bg-gray-100 text-gray-700 border border-gray-200"
                  }`}
                >
                  {session.status}
                </span>
                <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200 uppercase tracking-tighter">
                  {session.type === "quiz-template" ? "QUIZ TEMPLATE" : session.type.replace("-", " ").toUpperCase()}
                </span>
              </div>
              <p className="text-xs mt-1 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                {session.session_id && `Session ID: ${session.session_id}`}
                {session.pin && `PIN: ${session.pin}`}
                {session.question_count !== undefined && `${session.question_count} Questions`}
                {session.created_at && ` • Created ${new Date(session.created_at).toLocaleDateString()}`}
              </p>
            </div>
            
            <div className="flex items-center gap-2 ml-4">
              {session.type === "quiz-template" ? (
                <>
                  <button
                    onClick={() => (window.location.href = `/games/quiz/edit/${session.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-xs font-bold"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handlePlayTemplate(session.id as number)}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-bold shadow-sm flex items-center gap-1.5"
                  >
                    <Play size={12} fill="currentColor" /> Play
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onRejoinGame(session.type, session.id, session.session_id || session.pin || "")}
                  className="px-4 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-all text-xs font-bold shadow-sm flex items-center gap-1.5"
                >
                  <Play size={12} fill="currentColor" /> Open
                </button>
              )}
              <button
                onClick={() => handleDelete(session.type, session.id)}
                className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </GlassCard>
        </motion.div>
      ))}
    </div>
  );
};
