import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Clock, Copy, Check, Pause, Play, SkipForward, Square } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { gameAPI, GameRequestError } from "../../shared/utils/gameAPI";
import type { GameResponse } from "../../shared/utils/gameAPI";
import { eduGamesUrl } from "../../shared/utils/eduGamesUrl";

interface GameMonitoringPageProps {
  /** The game's session id (for example "game_a1b2c3d4"). */
  sessionId: string;
  onBack: () => void;
}

const POLL_MS = 2000;

/** Players ranked by score; equal scores share a rank. */
const ranked = (players: GameResponse["players"]) => {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.join_order - b.join_order);
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score) rank = index + 1;
    return { player, rank };
  });
};

export const GameMonitoringPage: React.FC<GameMonitoringPageProps> = ({ sessionId, onBack }) => {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const receivedAt = useRef(0);

  const accept = useCallback((next: GameResponse) => {
    receivedAt.current = Date.now();
    setGame(next);
    setLoadError("");
  }, []);

  // Poll while the game can still change. The server applies turn timeouts whenever the game is read.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async () => {
      try {
        const next = await gameAPI.getGame(sessionId);
        if (!alive) return;
        accept(next);
        if (next.status === "completed" && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch (err) {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "Could not load the game.");
        if (err instanceof GameRequestError && [403, 404].includes(err.status) && timer) {
          clearInterval(timer); // it will never work, so stop asking
          timer = null;
        }
      }
    };
    void load();
    timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [sessionId, accept]);

  // Display-only countdown between polls.
  useEffect(() => {
    if (!game || game.status !== "active" || game.time_left == null) {
      setSecondsLeft(game?.status === "paused" ? game.time_left : null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil(game.time_left! - (Date.now() - receivedAt.current) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [game]);

  const act = async (action: () => Promise<GameResponse>) => {
    setBusy(true);
    setActionError("");
    try {
      accept(await action());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (label: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  };

  const back = (
    <button onClick={onBack} className="rounded-lg p-2 transition-colors hover:bg-slate-100" aria-label="Back">
      <ArrowLeft size={24} style={{ color: "var(--color-text-primary)" }} />
    </button>
  );

  if (!game) {
    return (
      <div className="space-y-6">
        {back}
        <GlassCard className="p-10 text-center">
          {loadError ? (
            <>
              <AlertCircle className="mx-auto mb-3 text-red-500" size={36} />
              <p className="font-semibold text-red-600">{loadError}</p>
              <button onClick={onBack} className="btn btn-primary mt-4">Go back</button>
            </>
          ) : (
            <p style={{ color: "var(--color-text-secondary)" }}>Loading the game...</p>
          )}
        </GlassCard>
      </div>
    );
  }

  const link = eduGamesUrl(`/games/chain-answer/${game.session_id}`);
  const current = game.players.find((p) => p.id === game.current_player_id);
  const rejected = game.words.filter((w) => !w.is_valid).slice(-8).reverse();
  const statusLabel = { setup: "Waiting to start", active: "In progress", paused: "Paused", completed: "Finished" }[game.status];
  const lastWord = game.chain.length ? game.chain[game.chain.length - 1].word : game.starting_word;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {back}
          <div>
            <h1 className="text-3xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>{game.name}</h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {statusLabel} · {game.chain_variation} chain · {game.time_per_turn}s per turn{game.max_words ? ` · ends after ${game.max_words} words` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {game.status === "setup" && (
            <button onClick={() => void act(() => gameAPI.startGame(sessionId))} disabled={busy || game.players.length === 0} className="btn btn-primary flex items-center gap-2 disabled:opacity-50" title={game.players.length === 0 ? "Wait for at least one player" : ""}>
              <Play size={16} /> Start game
            </button>
          )}
          {game.status === "active" && (
            <>
              <button onClick={() => void act(() => gameAPI.skipTurn(sessionId))} disabled={busy} className="btn btn-outline flex items-center gap-2"><SkipForward size={16} /> Skip turn</button>
              <button onClick={() => void act(() => gameAPI.pauseGame(sessionId))} disabled={busy} className="btn btn-outline flex items-center gap-2"><Pause size={16} /> Pause</button>
            </>
          )}
          {game.status === "paused" && (
            <button onClick={() => void act(() => gameAPI.resumeGame(sessionId))} disabled={busy} className="btn btn-primary flex items-center gap-2"><Play size={16} /> Resume</button>
          )}
          {game.status !== "completed" && (
            <button
              onClick={() => { if (window.confirm("End the game now? Final scores will be saved to the players' records.")) void act(() => gameAPI.endGame(sessionId)); }}
              disabled={busy}
              className="btn flex items-center gap-2 border border-red-200 text-red-700 hover:bg-red-50"
            >
              <Square size={16} /> End game
            </button>
          )}
        </div>
      </div>

      {(actionError || loadError) && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {actionError || `Connection problem: ${loadError}`}
        </p>
      )}

      {game.status === "setup" && (
        <GlassCard className="space-y-3 p-6">
          <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Share with students</h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Players you added can join from EduGames with this code or link. Start when everyone is in.</p>
          {[{ label: "Code", value: game.session_id }, { label: "Link", value: link }].map((row) => (
            <div key={row.label} className="flex items-center gap-2 rounded-lg p-3" style={{ background: "var(--color-bg-tertiary)" }}>
              <span className="w-12 text-xs font-bold uppercase text-slate-500">{row.label}</span>
              <code className="flex-1 truncate text-sm font-semibold" style={{ color: "var(--color-brand-blue)" }}>{row.value}</code>
              <button onClick={() => copy(row.label, row.value)} className="rounded-lg p-2 hover:bg-slate-100" aria-label={`Copy ${row.label}`}>
                {copied === row.label ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
              </button>
            </div>
          ))}
        </GlassCard>
      )}

      {(game.status === "active" || game.status === "paused") && (
        <GlassCard className="grid gap-4 p-6 text-center sm:grid-cols-3">
          <div><p className="text-xs font-semibold uppercase text-slate-500">Last word</p><p className="text-3xl font-black font-display" style={{ color: "var(--color-brand-blue)" }}>{lastWord}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-500">Whose turn</p><p className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{current?.name ?? "-"}</p></div>
          <div><p className="text-xs font-semibold uppercase text-slate-500">Time left</p><p className="flex items-center justify-center gap-1.5 text-3xl font-black tabular-nums" style={{ color: "var(--color-text-primary)" }}><Clock size={22} />{secondsLeft ?? "--"}s</p></div>
        </GlassCard>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="space-y-3 p-6">
          <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Players ({game.players.length})</h2>
          {game.players.length === 0 && <p className="text-sm text-slate-500">No players yet.</p>}
          <ol className="space-y-2">
            {ranked(game.players).map(({ player, rank }) => (
              <li key={player.id} className="flex items-center justify-between rounded-lg px-4 py-2.5" style={{ background: player.id === game.current_player_id && game.status === "active" ? "color-mix(in srgb, var(--color-brand-blue) 12%, transparent)" : "var(--color-bg-tertiary)" }}>
                <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{rank}. {player.name}</span>
                <span className="text-right text-sm"><strong style={{ color: "var(--color-brand-blue)" }}>{player.score}</strong> pts <span className="text-xs text-slate-400">· {player.words_valid}/{player.words_submitted} accepted</span></span>
              </li>
            ))}
          </ol>
        </GlassCard>

        <GlassCard className="space-y-3 p-6">
          <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>The chain ({game.chain.length})</h2>
          <ol className="max-h-80 space-y-1.5 overflow-y-auto">
            {[...game.chain].reverse().map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{entry.word}</span>
                <span className="text-xs text-slate-400">{entry.submitted_by === "system" ? "starting word" : entry.submitted_by}</span>
              </li>
            ))}
          </ol>
          {rejected.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Recently rejected</h3>
              <ul className="space-y-1">
                {rejected.map((entry) => (
                  <li key={entry.id} className="text-xs text-red-700"><strong>{entry.word}</strong> by {entry.submitted_by}: {entry.validation_reason}</li>
                ))}
              </ul>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};
