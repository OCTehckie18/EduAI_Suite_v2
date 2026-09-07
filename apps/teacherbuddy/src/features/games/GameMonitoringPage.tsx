import React, { useEffect, useState } from "react";
import { ArrowLeft, Pause, Play, Square, Zap } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { gameAPI } from "../../shared/utils/gameAPI";
import type { GameResponse } from "../../shared/utils/gameAPI";
import { motion } from "framer-motion";

interface GameMonitoringPageProps {
  gameId: number;
  sessionId: string;
  onBack: () => void;
}

export const GameMonitoringPage: React.FC<GameMonitoringPageProps> = ({
  gameId,
  sessionId,
  onBack,
}) => {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Fetch game data on mount and set up polling
  useEffect(() => {
    const fetchGame = async () => {
      try {
        setIsLoading(true);
        const gameData = await gameAPI.getGameById(gameId);
        setGame(gameData);
        setIsPaused(gameData.status === "paused");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load game";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGame();

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchGame, 2000);
    return () => clearInterval(interval);
  }, [gameId]);

  const handlePauseResume = async () => {
    try {
      if (isPaused) {
        const updated = await gameAPI.resumeGame(gameId);
        setGame(updated);
        setIsPaused(false);
      } else {
        const updated = await gameAPI.pauseGame(gameId);
        setGame(updated);
        setIsPaused(true);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update game";
      setError(errorMessage);
    }
  };

  const handleEndGame = async () => {
    try {
      const updated = await gameAPI.endGame(gameId);
      setGame(updated);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to end game";
      setError(errorMessage);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} style={{ color: "var(--color-text-primary)" }} />
        </button>
        <div className="flex items-center justify-center h-96">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full"
          />
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} style={{ color: "var(--color-text-primary)" }} />
        </button>
        <GlassCard className="p-8 text-center">
          <p className="text-red-500 text-lg">
            {error || "Failed to load game"}
          </p>
          <button
            onClick={onBack}
            className="mt-4 px-6 py-2 rounded-lg font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
            }}
          >
            Go Back
          </button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} style={{ color: "var(--color-text-primary)" }} />
        </button>
        <div>
          <h1
            className="text-4xl font-bold font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Monitor Game
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Session ID: {sessionId}
          </p>
        </div>
      </div>

      {/* Game Status */}
      <GlassCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm"
            >
              Game Name
            </p>
            <p
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {game.name}
            </p>
          </div>

          <div className="space-y-2">
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm"
            >
              Status
            </p>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  game.status === "active"
                    ? "bg-green-500"
                    : game.status === "paused"
                      ? "bg-yellow-500"
                      : "bg-gray-500"
                }`}
              />
              <p
                className="text-lg font-semibold capitalize"
                style={{ color: "var(--color-text-primary)" }}
              >
                {game.status}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm"
            >
              Players
            </p>
            <p
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {game.players?.length || 0}
            </p>
          </div>

          <div className="space-y-2">
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm"
            >
              Variation
            </p>
            <p
              className="text-lg font-semibold capitalize"
              style={{ color: "var(--color-text-primary)" }}
            >
              {game.chain_variation}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Game Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Word Chain */}
        <div className="lg:col-span-2">
          <GlassCard className="p-6 h-full">
            <h2
              className="text-xl font-bold mb-4"
              style={{ color: "var(--color-text-primary)" }}
            >
              Word Chain
            </h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {game.words && game.words.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {game.words.map((w: any, idx: number) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="px-4 py-2 rounded-lg font-semibold text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                      }}
                    >
                      {w.word}
                      <span
                        className="text-xs ml-2 opacity-75"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        by {w.submitted_by}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--color-text-secondary)" }}>
                  Game starting word: <strong>{game.starting_word}</strong>
                </p>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Players List */}
        <div>
          <GlassCard className="p-6 h-full">
            <h2
              className="text-xl font-bold mb-4"
              style={{ color: "var(--color-text-primary)" }}
            >
              Players
            </h2>
            <div className="space-y-2">
              {game.players && game.players.length > 0 ? (
                game.players.map((player: any) => (
                  <div
                    key={player.student_id}
                    className="p-3 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <p
                      className="font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {player.name || `Player ${player.student_id}`}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      ID: {player.student_id}
                    </p>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--color-text-secondary)" }}>
                  No players loaded yet
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handlePauseResume}
          className="flex-1 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
          style={{
            background: isPaused
              ? "linear-gradient(135deg, #10b981, #059669)"
              : "linear-gradient(135deg, #f59e0b, #d97706)",
          }}
        >
          {isPaused ? (
            <>
              <Play size={20} />
              Resume Game
            </>
          ) : (
            <>
              <Pause size={20} />
              Pause Game
            </>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleEndGame}
          className="flex-1 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
          }}
        >
          <Square size={20} />
          End Game
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBack}
          className="flex-1 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          }}
        >
          <Zap size={20} />
          Back to Games
        </motion.button>
      </div>
    </div>
  );
};
