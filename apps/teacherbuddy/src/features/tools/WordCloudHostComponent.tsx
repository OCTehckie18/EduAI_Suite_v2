import React, { useState, useEffect, useMemo } from "react";
import { GlassCard } from "../../shared/components/GlassCard";
import { BarChart, Copy, Check, ArrowLeft } from "lucide-react";

interface WordData {
  text: string;
  value: number;
}

interface WordCloudHostProps {
  onBack?: () => void;
  initialPin?: string;
}

/* ── Custom CSS Word Cloud ────────────────────────────────── */
const CLOUD_COLORS = ["#264796", "#2a4fa7", "#d0ae61", "#ddb867", "#16a34a", "#7c3aed", "#dc2626", "#0891b2"];

const SimpleWordCloud: React.FC<{ words: WordData[] }> = ({ words }) => {
  const maxValue = Math.max(...words.map(w => w.value), 1);

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 p-6 w-full h-full overflow-y-auto content-start md:content-center">
      {words.map((word, i) => {
        const ratio = maxValue <= 1 ? 1 : word.value / maxValue;
        const fontSize = 16 + ratio * 16; // 16px to 32px
        const color = CLOUD_COLORS[i % CLOUD_COLORS.length];

        return (
          <div
            key={word.text}
            className="transition-all duration-500 ease-out shadow-md rounded-2xl flex items-center gap-3 hover:scale-105 hover:shadow-lg"
            style={{
              backgroundColor: color,
              color: "white",
              padding: `${8 + ratio * 8}px ${16 + ratio * 8}px`,
            }}
          >
            <span
              style={{
                fontSize: `${fontSize}px`,
                fontWeight: 700,
                fontFamily: "Inter, sans-serif",
              }}
            >
              {word.text}
            </span>
            {word.value > 1 && (
              <span 
                className="rounded-full bg-white/25 text-white flex items-center justify-center font-bold px-2 py-1 backdrop-blur-sm shadow-inner"
                style={{
                  fontSize: `${Math.max(12, fontSize * 0.6)}px`,
                  minWidth: `${Math.max(24, fontSize)}px`,
                }}
              >
                {word.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ── Host Component ───────────────────────────────────────── */
export const WordCloudHostComponent: React.FC<WordCloudHostProps> = ({ onBack, initialPin }) => {
  const [prompt, setPrompt] = useState("");
  const [pin, setPin] = useState<string | null>(initialPin || null);
  const [words, setWords] = useState<WordData[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [copied, setCopied] = useState(false);

  const copyPin = () => {
    if (pin) {
      navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const startSession = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/wordcloud/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (response.ok) {
        const data = await response.json();
        setPin(data.pin);
      }
    } catch (e) {
      console.error("Failed to start session", e);
    }
  };

  useEffect(() => {
    if (!pin) return;

    let isCancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // If we joined an existing session without a prompt, fetch it
    if (!prompt) {
      fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/wordcloud/${pin}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.prompt && !isCancelled) {
            setPrompt(data.prompt);
          }
        })
        .catch(e => console.error("Failed to fetch session info", e));
    }

    const connect = () => {
      if (isCancelled) return;

      const getWsUrl = () => {
        const urlStr = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        if (urlStr.startsWith('/')) {
          const loc = window.location;
          const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${protocol}//${loc.host}${urlStr}/ws/wordcloud/${pin}?role=teacher`;
        } else {
          const url = new URL(urlStr);
          const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${protocol}//${url.host}/ws/wordcloud/${pin}?role=teacher`;
        }
      };

      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        if (isCancelled) {
          ws?.close();
          return;
        }
        console.log("[WordCloud] Teacher WebSocket connected");
        setSocket(ws);
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const message = JSON.parse(event.data);
          console.log("[WordCloud] Received message:", message);
          if (message.type === "cloud_update") {
            setWords(message.words || []);
          }
        } catch (e) {
          console.error("[WordCloud] Failed to parse message", e);
        }
      };

      ws.onerror = (err) => {
        console.error("[WordCloud] WebSocket error", err);
      };

      ws.onclose = () => {
        if (!isCancelled) {
          console.log("[WordCloud] Connection lost, reconnecting in 2s...");
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
  }, [pin]);

  const endSession = async () => {
    if (!pin) return;
    try {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "end_session" }));
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL || `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`}/wordcloud/${pin}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setPin(null);
        if (onBack) onBack();
      }
    } catch (e) {
      console.error("Failed to end session", e);
    }
  };

  if (!pin) {
    return (
      <div className="space-y-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-70 mb-4"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <ArrowLeft size={16} /> Back to Games
          </button>
        )}
        <GlassCard className="p-6">
          <h2 className="text-xl font-bold mb-4 font-display" style={{ color: "var(--color-text-primary)" }}>
            Host Live Word Cloud Battle
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                What question would you like to ask your students?
              </label>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Describe the Renaissance in one word"
                className="w-full px-4 py-2 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                style={{ background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
              />
            </div>
            <button
              onClick={startSession}
              disabled={!prompt.trim()}
              className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50"
              style={{ background: "var(--color-brand-blue)" }}
            >
              Start Word Cloud Session
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

return (
  <div className="space-y-4">
    {onBack && (
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-70 mb-4"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <ArrowLeft size={16} /> Back to Games
      </button>
    )}
    <GlassCard className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>
            {prompt}
          </h2>
          <p className="text-lg mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Join at <strong>edugames.app</strong> with PIN: <span className="font-mono text-xl text-blue-500 font-bold tracking-widest">{pin}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={copyPin}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            title="Copy PIN"
          >
            {copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} />}
          </button>
          <button 
            onClick={endSession}
            className="px-4 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors font-semibold"
          >
            End Session
          </button>
        </div>
      </div>

      <div className="w-full h-96 flex items-center justify-center rounded-xl bg-gray-50/50">
        {words.length === 0 ? (
          <div className="text-center" style={{ color: "var(--color-text-secondary)" }}>
            <BarChart size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Waiting for responses...</p>
          </div>
        ) : (
          <SimpleWordCloud words={words} />
        )}
      </div>
    </GlassCard>
  </div>
);
};
