import React, { useState, useEffect } from "react";
import { GlassCard } from "../../shared/components/GlassCard";
import { Send, CheckCircle2, Trophy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const WordCloudPlayerPage: React.FC = () => {
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<{ pin: string; prompt: string; ended?: boolean } | null>(null);
  const [word, setWord] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState("");

  const joinSession = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/wordcloud/${pin}`);
      if (response.ok) {
        const data = await response.json();
        setSession({ pin, prompt: data.prompt });
      } else {
        setError("Invalid PIN. Please try again.");
      }
    } catch (e) {
      setError("Failed to connect. Please check your connection.");
    }
  };

  // Manage WebSocket lifecycle in useEffect — runs when session is established
  useEffect(() => {
    if (!session || session.ended) return;

    let isCancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (isCancelled) return;

      const getWsUrl = () => {
        const urlStr = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        if (urlStr.startsWith('/')) {
          const loc = window.location;
          const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${protocol}//${loc.host}${urlStr}/ws/wordcloud/${session.pin}?role=student`;
        } else {
          const url = new URL(urlStr);
          const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${protocol}//${url.host}/ws/wordcloud/${session.pin}?role=student`;
        }
      };

      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        if (isCancelled) {
          ws?.close();
          return;
        }
        console.log("[WordCloud Student] WebSocket connected");
        setSocket(ws);
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "word_submitted") {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
          } else if (msg.type === "session_ended") {
            setSession(prev => prev ? { ...prev, ended: true } : null);
          }
        } catch (e) {
          console.error("[WordCloud Student] Failed to parse message", e);
        }
      };

      ws.onerror = (err) => {
        console.error("[WordCloud Student] WebSocket error", err);
      };

      ws.onclose = () => {
        if (!isCancelled) {
          console.log("[WordCloud Student] Connection lost, reconnecting in 2s...");
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };
  }, [session?.pin, session?.ended]);

  const submitWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && word.trim() && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "submit_word", word: word.trim() }));
      setWord("");
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <GlassCard className="w-full max-w-md p-8 text-center space-y-6">
          <h1 className="text-3xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>
            Join Word Cloud
          </h1>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="space-y-4">
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase())}
              placeholder="Game PIN"
              className="w-full text-center text-3xl tracking-widest font-mono py-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none uppercase"
              style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              maxLength={6}
            />
            <button
              onClick={joinSession}
              disabled={pin.length < 6}
              className="w-full py-4 rounded-xl font-bold text-white text-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              style={{ background: "var(--color-brand-blue)" }}
            >
              Enter
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (session && session.ended) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <GlassCard className="w-full max-w-md p-8 text-center space-y-6">
          <Trophy size={64} className="mx-auto text-yellow-400 mb-4" />
          <h1 className="text-3xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>
            Session Ended
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            The teacher has concluded this Word Cloud session. Thank you for participating!
          </p>
          <button
            onClick={() => {
              setSession(null);
              setPin("");
            }}
            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: "var(--color-brand-blue)" }}
          >
            Back to Home
          </button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #264796 0%, #2a4fa7 100%)" }}>
      <GlassCard className="w-full max-w-lg p-8">
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-wider font-bold" style={{ color: "var(--color-brand-gold)" }}>Live Prompt</p>
          <h2 className="text-2xl font-bold mt-2 text-white font-display">
            {session.prompt}
          </h2>
        </div>

        <form onSubmit={submitWord} className="space-y-4 relative">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Type a word..."
            className="w-full text-center text-2xl py-5 rounded-xl outline-none shadow-inner"
            autoFocus
          />
          <button
            type="submit"
            disabled={!word.trim() || !socket || socket.readyState !== WebSocket.OPEN}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-xl text-white transition-all bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit <Send size={24} />
          </button>

          <AnimatePresence>
            {showSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl"
              >
                <div className="flex flex-col items-center text-green-500">
                  <CheckCircle2 size={48} className="mb-2" />
                  <span className="font-bold text-xl">Sent!</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <p className="text-center text-white/70 mt-6 text-sm">
          You can submit multiple times!
        </p>
      </GlassCard>
    </div>
  );
};
