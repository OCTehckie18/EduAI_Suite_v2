import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Clock, Hourglass, LogOut, Pause, Send, Trophy, Wifi, WifiOff } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { useGameSync } from "./useGameSync";
import type { ConnectionMode } from "./useGameSync";
import type { GameResponse } from "../../shared/utils/gameAPI";

interface ChainGameBoardProps {
  sessionId: string;
  /** The signed-in student's account id; the server tells us which player that is. */
  myStudentId: number | null;
  onExit: () => void;
  onFatal?: (message: string) => void;
}

/** What the next word has to satisfy, in the student's words. */
const ruleHint = (game: GameResponse, lastWord: string): string => {
  const word = lastWord.toLowerCase();
  switch (game.chain_variation) {
    case "compound":
      return `Start with "${word.slice(-2).toUpperCase()}"`;
    case "ladder":
      return `${word.length} letters, changing exactly one letter of "${lastWord}"`;
    case "category":
      return `Any word in the category "${game.category || game.subject || "of this game"}"`;
    default:
      return `Start with "${word.slice(-1).toUpperCase()}"`;
  }
};

/** Players ranked by score. Players on the same score share a rank. */
const rankPlayers = (players: GameResponse["players"]) => {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.join_order - b.join_order);
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score) rank = index + 1;
    return { player, rank, tied: sorted.filter((p) => p.score === player.score).length > 1 };
  });
};

const ConnectionBadge: React.FC<{ mode: ConnectionMode }> = ({ mode }) => {
  const live = mode === "live";
  const color = live ? "#10b981" : mode === "polling" ? "#f59e0b" : "var(--color-error)";
  const label = live ? "Live" : mode === "polling" ? "Reconnecting (slower updates)" : mode === "connecting" ? "Connecting..." : "Disconnected";
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
      {live || mode === "polling" ? <Wifi size={14} /> : <WifiOff size={14} />} {label}
    </span>
  );
};

export const ChainGameBoard: React.FC<ChainGameBoardProps> = ({ sessionId, myStudentId, onExit, onFatal }) => {
  const { game, mode, error, feedback, secondsLeft, fatal, submitWord } = useGameSync({ sessionId, onFatal });
  const [input, setInput] = useState("");

  const me = useMemo(() => game?.players.find((p) => p.student_id === myStudentId) ?? null, [game, myStudentId]);
  const isMyTurn = !!me && game?.status === "active" && game.current_player_id === me.id;
  const current = game?.players.find((p) => p.id === game.current_player_id) ?? null;
  const lastWord = game ? (game.chain.length ? game.chain[game.chain.length - 1].word : game.starting_word) : "";

  // A new turn (or a rejected word) is a fresh chance, so the box is cleared when the turn changes.
  useEffect(() => {
    setInput("");
  }, [game?.current_player_id, game?.chain.length]);

  if (fatal) {
    return (
      <GlassCard className="mx-auto max-w-lg space-y-4 p-8 text-center">
        <AlertCircle className="mx-auto text-red-500" size={40} />
        <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{fatal}</p>
        <button onClick={onExit} className="btn btn-primary">Back to games</button>
      </GlassCard>
    );
  }
  if (!game) {
    return (
      <div className="flex flex-col items-center gap-3 py-24" style={{ color: "var(--color-text-secondary)" }}>
        <Hourglass className="animate-pulse" size={36} />
        Loading the game...
      </div>
    );
  }

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    const word = input.trim();
    if (!word || !isMyTurn) return;
    void submitWord(word);
    setInput("");
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>{game.name}</h1>
        <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {game.chain_variation} chain · {game.time_per_turn}s per turn{game.max_words ? ` · ${game.max_words} words` : ""}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <ConnectionBadge mode={mode} />
        <button onClick={onExit} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-red-600" title="Leave the game screen">
          <LogOut size={16} /> Leave
        </button>
      </div>
    </div>
  );

  // ── Final standings ──
  if (game.status === "completed") {
    const ranking = rankPlayers(game.players);
    const mine = ranking.find((r) => r.player.id === me?.id);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <GlassCard className="space-y-5 p-8 text-center">
          <Trophy className="mx-auto" size={44} style={{ color: "var(--color-brand-gold)" }} />
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Game over</h2>
          {mine && (
            <p style={{ color: "var(--color-text-secondary)" }}>
              You finished {mine.tied ? "joint " : ""}#{mine.rank} with <strong>{mine.player.score}</strong> points
              ({mine.player.words_valid} accepted of {mine.player.words_submitted} words).
            </p>
          )}
          <ol className="space-y-2 text-left">
            {ranking.map(({ player, rank, tied }) => (
              <li key={player.id} className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: player.id === me?.id ? "color-mix(in srgb, var(--color-brand-blue) 10%, transparent)" : "var(--color-bg-tertiary)" }}>
                <span className="flex items-center gap-3 font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  <span className="w-9 text-center text-sm font-bold text-slate-500">{tied ? "=" : ""}{rank}</span>
                  {player.name}{player.id === me?.id ? " (you)" : ""}
                </span>
                <span className="font-bold" style={{ color: "var(--color-brand-blue)" }}>{player.score} pts</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">Your result has been saved to your record.</p>
          <button onClick={onExit} className="btn btn-primary">Back to games</button>
        </GlassCard>
      </div>
    );
  }

  // ── Lobby / paused ──
  if (game.status === "setup" || game.status === "paused") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {header}
        <GlassCard className="space-y-5 p-10 text-center">
          {game.status === "paused" ? <Pause size={44} className="mx-auto" style={{ color: "var(--color-brand-blue)" }} /> : (
            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="inline-block">
              <Hourglass size={44} style={{ color: "var(--color-brand-blue)" }} />
            </motion.div>
          )}
          <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{game.status === "paused" ? "The game is paused" : "Waiting for the teacher to start"}</h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {me ? "You are in. Stay on this screen, the game starts for everyone at once." : "Joining the game..."}
          </p>
          <div className="mx-auto max-w-sm space-y-2 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Players ({game.players.length})</p>
            {game.players.map((player) => (
              <div key={player.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--color-bg-tertiary)" }}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "var(--color-brand-blue-fill)" }}>{player.name.charAt(0).toUpperCase()}</span>
                <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{player.name}{player.id === me?.id ? " (you)" : ""}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    );
  }

  // ── Playing ──
  const urgent = secondsLeft != null && secondsLeft <= 5;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {header}
      <GlassCard className="space-y-4 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last word</p>
        <p className="text-4xl font-black font-display" style={{ color: "var(--color-brand-blue)" }}>{lastWord}</p>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{ruleHint(game, lastWord)}</p>
      </GlassCard>

      <div className="flex items-center justify-between rounded-xl px-5 py-3" style={{ background: isMyTurn ? "color-mix(in srgb, var(--color-brand-blue) 12%, transparent)" : "var(--color-bg-tertiary)" }}>
        <p className="font-bold" style={{ color: "var(--color-text-primary)" }}>
          {isMyTurn ? "Your turn!" : current ? `${current.name}'s turn` : "Waiting..."}
        </p>
        <p className={`flex items-center gap-1.5 text-xl font-black tabular-nums ${urgent ? "animate-pulse text-red-600" : ""}`} style={urgent ? undefined : { color: "var(--color-text-primary)" }}>
          <Clock size={18} /> {secondsLeft ?? "--"}s
        </p>
      </div>

      <form onSubmit={send} className="flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!isMyTurn}
          autoFocus
          autoComplete="off"
          maxLength={50}
          placeholder={isMyTurn ? "Type your word and press Enter" : "Wait for your turn"}
          className="form-input flex-1 text-lg disabled:opacity-50"
          aria-label="Your word"
        />
        <button type="submit" disabled={!isMyTurn || !input.trim()} className="btn btn-primary flex items-center gap-2 px-6 disabled:opacity-50">
          <Send size={18} /> Send
        </button>
      </form>

      {feedback && !feedback.isValid && isMyTurn && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> "{feedback.word}" was not accepted: {feedback.reason}. You can try again.
        </p>
      )}
      {error && <p className="text-sm font-semibold text-amber-700" role="status">{error}</p>}

      <div className="grid gap-5 md:grid-cols-2">
        <GlassCard className="space-y-2 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">The chain ({game.chain.length})</h3>
          <ol className="max-h-72 space-y-1.5 overflow-y-auto">
            {[...game.chain].reverse().map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{entry.word}</span>
                <span className="text-xs text-slate-400">{entry.submitted_by === "system" ? "start" : entry.submitted_by}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
        <GlassCard className="space-y-2 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Scores</h3>
          <ol className="space-y-1.5">
            {rankPlayers(game.players).map(({ player, rank }) => (
              <li key={player.id} className="flex items-center justify-between text-sm">
                <span className={player.id === game.current_player_id ? "font-bold" : ""} style={{ color: "var(--color-text-primary)" }}>
                  {rank}. {player.name}{player.id === me?.id ? " (you)" : ""}{player.id === game.current_player_id ? " ◀" : ""}
                </span>
                <span className="font-bold" style={{ color: "var(--color-brand-blue)" }}>{player.score}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>
    </div>
  );
};
