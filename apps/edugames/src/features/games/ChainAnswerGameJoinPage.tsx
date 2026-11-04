import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader, Play, Users } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { gameAPI } from "../../shared/utils/gameAPI";
import type { GameResponse } from "../../shared/utils/gameAPI";
import { requestGameFullscreen } from "./fullscreen";

interface Props {
  initialSessionId?: string;
  /** Called once the server has added this student to the game. */
  onJoined: (sessionId: string) => void;
}

export const ChainAnswerGameJoinPage: React.FC<Props> = ({ initialSessionId = "", onJoined }) => {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [myGames, setMyGames] = useState<GameResponse[] | null>(null);

  useEffect(() => {
    gameAPI.listMyGames().then((games) => setMyGames(games.filter((g) => g.status !== "completed"))).catch(() => setMyGames([]));
  }, []);

  const join = async (code: string) => {
    const wanted = code.trim();
    if (!wanted) {
      setError("Enter the game code from your teacher.");
      return;
    }
    requestGameFullscreen();
    setBusy(true);
    setError("");
    try {
      // The server adds you as yourself (your name comes from your account) and tells you if you may not play.
      await gameAPI.joinGame(wanted);
      onJoined(wanted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that game.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-4xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Chain Answer Game</h1>
        <p className="mt-2" style={{ color: "var(--color-text-secondary)" }}>Join a game and test your word chain skills.</p>
      </div>

      {myGames && myGames.length > 0 && (
        <GlassCard className="space-y-3 p-6">
          <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>Games your teacher added you to</h2>
          {myGames.map((game) => (
            <div key={game.session_id} className="flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--color-bg-tertiary)" }}>
              <div>
                <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>{game.name}</p>
                <p className="text-xs text-slate-500">{game.status === "active" ? "In progress" : game.status === "paused" ? "Paused" : "Waiting to start"} · {game.players.length} players</p>
              </div>
              <button onClick={() => void join(game.session_id)} disabled={busy} className="btn btn-primary text-sm disabled:opacity-50">Join</button>
            </div>
          ))}
        </GlassCard>
      )}

      <GlassCard className="space-y-5 p-8">
        <div>
          <label className="mb-2 block text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Game code</label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void join(sessionId)}
            className="form-input w-full"
            placeholder="e.g. game_a1b2c3d4"
            autoComplete="off"
          />
          <p className="mt-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>Your teacher shows this code on their screen. You play as yourself, so there is no name to type.</p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
            <p className="font-semibold text-red-700">{error}</p>
          </motion.div>
        )}

        <button onClick={() => void join(sessionId)} disabled={busy || !sessionId.trim()} className="btn btn-primary flex w-full items-center justify-center gap-2 py-3 text-lg disabled:opacity-50">
          {busy ? <><Loader size={20} className="animate-spin" /> Joining...</> : <><Play size={20} /> Join game</>}
        </button>
      </GlassCard>

      <GlassCard className="space-y-2 p-6">
        <h3 className="flex items-center gap-2 font-bold" style={{ color: "var(--color-text-primary)" }}><Users size={18} /> How to play</h3>
        <ul className="space-y-1.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <li>• Join with the code, then wait for the teacher to start.</li>
          <li>• Players take turns. When it is your turn, type a word that follows the game's rule.</li>
          <li>• A valid word scores 10 points. A rejected word does not change the chain and you can try again until your time runs out.</li>
          <li>• Leaving full screen or the game screen does not remove you; you can come back with the same code.</li>
        </ul>
      </GlassCard>
    </div>
  );
};
