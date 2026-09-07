import React, { useState } from "react";
import { GlassCard } from "../../shared/components/GlassCard";
import { ChainGameBoard } from "./ChainGameBoard";
import { gameAPI } from "../../shared/utils/gameAPI";
import {
  createChainAnswerPlayerId,
  saveChainAnswerPlayerSession,
} from "./chainAnswerPlayerSession";
import { motion } from "framer-motion";
import { Play, Users, Lock, Loader, Copy, CheckCircle } from "lucide-react";

interface ChainAnswerGameJoinPageProps {
  initialSessionId?: string;
  onJoined?: (session: {
    gameId: number;
    sessionId: string;
    playerId: string;
    playerName: string;
  }) => void;
}

export const ChainAnswerGameJoinPage: React.FC<
  ChainAnswerGameJoinPageProps
> = ({ initialSessionId = "", onJoined }) => {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [playerName, setPlayerName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [gameId, setGameId] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const handleJoinGame = async () => {
    if (!sessionId.trim() || !playerName.trim()) {
      setError("Please enter session ID and your name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch game by session ID
      const game = await gameAPI.getGameBySessionId(sessionId);

      // Find the player in the registered list by name (case-insensitive)
      const registeredPlayer = game.players?.find(
        (p: any) =>
          p.name.trim().toLowerCase() === playerName.trim().toLowerCase(),
      );

      setGameId(game.id);

      // Use the actual student_id from the backend if they match, otherwise generate one
      const effectivePlayerId = registeredPlayer ? registeredPlayer.student_id : createChainAnswerPlayerId();

      setPlayerId(effectivePlayerId);
      saveChainAnswerPlayerSession(
        game.id,
        sessionId,
        playerName,
        effectivePlayerId,
      );

      onJoined?.({
        gameId: game.id,
        sessionId,
        playerId: effectivePlayerId,
        playerName,
      });

      setJoined(true);
    } catch (err) {
      setError("Game session not found. Please check the session ID.");
      console.error("Error joining game:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (joined && gameId) {
    return (
      <ChainGameBoard
        gameId={gameId}
        sessionId={sessionId}
        playerId={playerId}
        playerName={playerName}
        userType="student"
        onExit={() => setJoined(false)}
        onGameEnded={() => setJoined(false)}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1
          className="text-4xl font-bold font-display"
          style={{ color: "var(--color-text-primary)" }}
        >
          Chain Answer Game
        </h1>
        <p style={{ color: "var(--color-text-secondary)" }} className="mt-2">
          Join a game and test your word chain skills
        </p>
      </div>

      <GlassCard className="p-8 space-y-6">
        <div>
          <label
            className="block text-sm font-semibold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            Game Session ID
          </label>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            readOnly={Boolean(initialSessionId)}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="e.g., game_a1b2c3d4"
          />
          <p
            style={{ color: "var(--color-text-secondary)" }}
            className="text-xs mt-2"
          >
            {initialSessionId
              ? "Using the session linked to this game entry."
              : "Ask your teacher for the session ID"}
          </p>
        </div>

        <div>
          <label
            className="block text-sm font-semibold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            Your Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleJoinGame()}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Enter your name"
          />
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-500/20 border border-red-500 rounded-lg"
          >
            <p
              style={{ color: "var(--color-error)" }}
              className="font-semibold"
            >
              {error}
            </p>
          </motion.div>
        )}

        <motion.button
          whileHover={!isLoading ? { scale: 1.02 } : {}}
          whileTap={!isLoading ? { scale: 0.98 } : {}}
          onClick={handleJoinGame}
          disabled={isLoading || !sessionId.trim() || !playerName.trim()}
          className="w-full px-6 py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          style={{
            background:
              isLoading || !sessionId.trim() || !playerName.trim()
                ? "#9ca3af"
                : "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
          }}
        >
          {isLoading ? (
            <>
              <Loader size={20} className="animate-spin" />
              Joining Game...
            </>
          ) : (
            <>
              <Play size={20} />
              Join Game
            </>
          )}
        </motion.button>
      </GlassCard>

      <GlassCard className="p-6 bg-blue-500/10 border-blue-200 dark:border-blue-700">
        <h3
          className="font-bold mb-3 flex items-center gap-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          <Users size={18} />
          How to Play
        </h3>
        <ul
          className="space-y-2 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <li> Get the session ID from your teacher</li>
          <li> Enter your name and join the game</li>
          <li> When the game starts, take turns submitting words</li>
          <li> Each word must follow the game's chain rule</li>
          <li> Earn points for valid words and speed</li>
        </ul>
      </GlassCard>
    </div>
  );
};
