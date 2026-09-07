import React, { useState, useEffect, useRef } from "react";
import type { ChainGameState, ChainGameActions } from "./types";
import { GlassCard } from "../../shared/components/GlassCard";
import { useGameSync } from "./useGameSync";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  AlertCircle,
  Send,
  Wifi,
  WifiOff,
  Play,
  Square,
  Hourglass,
  Trophy,
  Copy,
  Check,
} from "lucide-react";

interface ChainGameBoardProps {
  gameState?: ChainGameState;
  actions?: ChainGameActions;
  currentPlayerId?: string;
  // For real-time sync mode
  gameId?: number;
  sessionId?: string;
  playerId?: string;
  playerName?: string;
  userType?: "teacher" | "student";
  onError?: (error: string) => void;
  onGameEnded?: () => void;
  onExit?: () => void;
}

export const ChainGameBoard: React.FC<ChainGameBoardProps> = ({
  gameState: propsGameState,
  actions: propsActions,
  currentPlayerId: propsCurrentPlayerId,
  gameId,
  sessionId,
  playerId,
  playerName,
  userType = "teacher",
  onError,
  onGameEnded,
  onExit,
}) => {
  const [inputWord, setInputWord] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Track the last currentPlayerIndex we auto-skipped for, to avoid double-skip
  const lastSkippedIndexRef = useRef<number | null>(null);

  // Use WebSocket sync if sessionId is provided
  const syncEnabled = Boolean(sessionId);
  const {
    isConnected,
    connectionMode,
    gameState: wsGameState,
    submitWord,
    startGame: wsStartGame,
    endGame: wsEndGame,
    nextQuestion: wsNextQuestion,
    skipTurn: wsSkipTurn,
  } = useGameSync({
    sessionId: syncEnabled ? sessionId! : "",
    gameId: gameId || 0,
    playerId: playerId || "",
    playerName: playerName || "",
    userType,
    onError,
  });

  // Use either synced state (real-time) or props state (local)
  const gameState = wsGameState || propsGameState;
  const actions = propsActions;
  const currentPlayerId = playerId || propsCurrentPlayerId;

  const gameName =
    (gameState as any)?.name ||
    (gameState as any)?.session?.name ||
    (gameState as any)?.game?.name ||
    "Chain Answer Game";

  const gameStatus =
    (gameState as any)?.gameStatus ||
    (gameState as any)?.status ||
    (gameState as any)?.game?.status ||
    "setup";

  const questions =
    (gameState as any)?.questions ||
    (gameState as any)?.game?.questions ||
    [];

  const currentQuestionIndex =
    (gameState as any)?.current_question_index ??
    (gameState as any)?.game?.current_question_index ??
    0;

  const currentPlayerIndex = gameState?.currentPlayerIndex ?? 0;
  const players = gameState?.players || [];
  const currentPlayer = players[currentPlayerIndex] || players[0];

  // Determine if it's the current user's turn
  const normalizedPlayerName = playerName?.trim().toLowerCase();
  const isCurrentPlayerTurn =
    String(currentPlayerId) === String(currentPlayer?.id) ||
    String(currentPlayerId) === String(currentPlayer?.student_id) ||
    String(currentPlayerId) === String(currentPlayer?.studentId) ||
    (!!normalizedPlayerName &&
      currentPlayer?.name?.trim().toLowerCase() === normalizedPlayerName);

  const lastWord =
    (gameState as any)?.chain?.length > 0
      ? (gameState as any)?.chain[(gameState as any)?.chain.length - 1]?.word
      : (gameState as any)?.starting_word ||
        (gameState as any)?.session?.startingWord ||
        (gameState as any)?.game?.starting_word ||
        "";

  const requiredLetter = lastWord
    ? lastWord.charAt(lastWord.length - 1).toUpperCase()
    : "?";

  // ─── Handle word submission ───────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPlayerId || !inputWord.trim()) return;

    const responseTime = startTime ? (Date.now() - startTime) / 1000 : 0;

    try {
      if (sessionId && playerId) {
        // Real-time mode: use WebSocket
        submitWord(inputWord);
      } else if (actions) {
        // Local mode: use state actions
        const success = await actions.submitWord(
          currentPlayerId,
          inputWord,
          responseTime,
        );
        if (success) {
          setInputWord("");
          setStartTime(Date.now());
        }
        return; // local mode handles its own clearing
      }
      setInputWord("");
      setStartTime(Date.now());
    } catch (error) {
      console.error("Error submitting word:", error);
    }
  };

  // ─── Timer expiry: auto-skip to next player ───────────────
  useEffect(() => {
    if (!gameState || gameStatus !== "active") return;
    if ((gameState.timer || 0) > 0) {
      // Timer is still ticking — clear the skip guard so we can skip again when it reaches 0
      return;
    }

    // Timer has reached 0
    // Only skip if we haven't already skipped for this exact playerIndex
    if (lastSkippedIndexRef.current === currentPlayerIndex) return;
    lastSkippedIndexRef.current = currentPlayerIndex;

    const skipTimer = setTimeout(() => {
      const skipId =
        currentPlayer?.student_id || currentPlayer?.id;
      if (syncEnabled && skipId) {
        wsSkipTurn(String(skipId));
      } else if (actions?.skipTurn && currentPlayer) {
        actions.skipTurn(currentPlayer.id || currentPlayer.student_id);
      }
      setInputWord("");
      setStartTime(Date.now());
    }, 500);

    return () => clearTimeout(skipTimer);
  }, [
    gameState?.timer,
    gameStatus,
    currentPlayerIndex,
    currentPlayer,
    actions,
    syncEnabled,
    wsSkipTurn,
  ]);

  // Reset skip guard when the player index actually changes (from a successful skip/submit)
  useEffect(() => {
    // When currentPlayerIndex changes, allow future skips for the new player
    lastSkippedIndexRef.current = null;
  }, [currentPlayerIndex]);

  // Reset start time when it becomes our turn
  useEffect(() => {
    if (isCurrentPlayerTurn && gameStatus === "active") {
      setStartTime(Date.now());
    }
  }, [isCurrentPlayerTurn, gameStatus]);

  // ─── Handle game ended state ──────────────────────────────
  useEffect(() => {
    if (
      (gameStatus === "completed" || gameStatus === "ended") &&
      onGameEnded
    ) {
      onGameEnded();
    }
  }, [gameStatus, onGameEnded]);

  // ─── Copy session ID ──────────────────────────────────────
  const handleCopySessionId = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ─── Pre-game lobby (game not yet started) ────────────────
  if (gameStatus === "setup" || gameStatus === "paused") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1
              className="text-3xl font-bold font-display"
              style={{ color: "var(--color-text-primary)" }}
            >
              {gameName}
            </h1>
            {sessionId && (
              <div className="flex items-center gap-2 mt-2">
                <p
                  style={{ color: "var(--color-text-secondary)" }}
                  className="text-sm"
                >
                  Session: <strong>{sessionId}</strong>
                </p>
                <button
                  onClick={handleCopySessionId}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Copy Session ID"
                >
                  {copied ? (
                    <Check size={14} style={{ color: "#10b981" }} />
                  ) : (
                    <Copy
                      size={14}
                      style={{ color: "var(--color-text-secondary)" }}
                    />
                  )}
                </button>
              </div>
            )}
          </div>
          {sessionId && (
            <div className="flex items-center gap-2 text-sm">
              {connectionMode === "ws" && isConnected ? (
                <>
                  <Wifi size={16} style={{ color: "#10b981" }} />
                  <span style={{ color: "#10b981" }}>Live</span>
                </>
              ) : connectionMode === "polling" ? (
                <>
                  <Wifi size={16} style={{ color: "#f59e0b" }} />
                  <span style={{ color: "#f59e0b" }}>Polling</span>
                </>
              ) : (
                <>
                  <WifiOff
                    size={16}
                    style={{ color: "var(--color-error)" }}
                  />
                  <span style={{ color: "var(--color-error)" }}>
                    Connecting…
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Waiting Lobby */}
        <GlassCard className="p-12 text-center space-y-6">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="inline-block"
          >
            <Hourglass
              size={48}
              style={{ color: "var(--color-brand-blue)" }}
            />
          </motion.div>

          <div>
            <h2
              className="text-2xl font-bold font-display mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              {gameStatus === "paused"
                ? "Game Paused"
                : "Waiting for Game to Start"}
            </h2>
            <p style={{ color: "var(--color-text-secondary)" }}>
              {userType === "teacher"
                ? "Press Start Game when all players have joined"
                : "The teacher will start the game shortly..."}
            </p>
          </div>

          {/* Players in lobby */}
          {players.length > 0 && (
            <div className="text-left max-w-md mx-auto">
              <p
                className="text-sm font-semibold mb-3"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Players joined ({players.length}):
              </p>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <motion.div
                    key={
                      player.id
                        ? `lobby-${player.id}`
                        : `lobby-${index}`
                    }
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      background: "var(--color-bg-tertiary)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                      }}
                    >
                      {player.name?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <span
                      className="font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {player.name}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Teacher controls */}
          {userType === "teacher" && (
            <div className="flex justify-center gap-4 pt-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (syncEnabled) {
                    wsStartGame();
                  } else if (actions?.startGame) {
                    actions.startGame();
                  }
                }}
                disabled={players.length < 2}
                className="px-8 py-4 rounded-xl font-bold text-white text-lg flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{
                  background:
                    players.length >= 2
                      ? "linear-gradient(135deg, #10b981, #059669)"
                      : "#6b7280",
                }}
              >
                <Play size={24} />
                Start Game
              </motion.button>
            </div>
          )}
        </GlassCard>

        {/* Session ID sharing card for teacher */}
        {userType === "teacher" && sessionId && (
          <GlassCard className="p-6">
            <h3
              className="font-bold mb-3"
              style={{ color: "var(--color-text-primary)" }}
            >
              Share with Students
            </h3>
            <div
              className="flex items-center gap-3 p-4 rounded-lg"
              style={{ background: "var(--color-bg-tertiary)" }}
            >
              <code
                className="flex-1 text-lg font-mono font-bold"
                style={{ color: "var(--color-brand-blue)" }}
              >
                {sessionId}
              </code>
              <button
                onClick={handleCopySessionId}
                className="px-4 py-2 rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                }}
              >
                {copied ? (
                  <>
                    <Check size={16} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={16} /> Copy
                  </>
                )}
              </button>
            </div>
            <p
              className="text-sm mt-2"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Students use this session ID to join the game
            </p>
          </GlassCard>
        )}
      </div>
    );
  }

  // ─── Game completed screen ────────────────────────────────
  if (gameStatus === "completed" || gameStatus === "ended") {
    const sortedPlayers = [...players].sort(
      (a, b) => (b.score || 0) - (a.score || 0),
    );
    return (
      <div className="space-y-6">
        <GlassCard className="p-12 text-center space-y-6">
          <Trophy size={64} style={{ color: "var(--color-brand-gold)" }} className="mx-auto" />
          <h1
            className="text-4xl font-bold font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Game Over!
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            {(gameState as any)?.chain?.length || 0} words chained
          </p>
        </GlassCard>

        {/* Final Scoreboard */}
        <GlassCard className="p-6">
          <h3
            className="font-bold mb-4 text-xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            Final Standings
          </h3>
          <div className="space-y-3">
            {sortedPlayers.map((player, index) => (
              <motion.div
                key={player.id ? `final-${player.id}` : `final-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15 }}
                className="flex items-center p-4 rounded-xl"
                style={{
                  background:
                    index === 0
                      ? "linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05))"
                      : "var(--color-bg-tertiary)",
                  border:
                    index === 0
                      ? "2px solid rgba(234, 179, 8, 0.3)"
                      : "none",
                }}
              >
                <span
                  className="text-2xl font-bold w-10 text-center"
                  style={{
                    color:
                      index === 0
                        ? "var(--color-brand-gold)"
                        : "var(--color-text-secondary)",
                  }}
                >
                  {index === 0 ? "" : index === 1 ? "" : index === 2 ? "" : `${index + 1}`}
                </span>
                <span
                  className="font-semibold flex-1 ml-3"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {player.name}
                </span>
                <span
                  className="font-bold text-lg"
                  style={{ color: "var(--color-brand-gold)" }}
                >
                  {player.score || 0} pts
                </span>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        {onExit && (
          <button
            onClick={onExit}
            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: "var(--color-brand-blue)" }}
          >
            Back to Home
          </button>
        )}
      </div>
    );
  }

  // ─── Active game board ────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Game Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1
            className="text-3xl font-bold font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            {gameName}
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            {sessionId ? `Session: ${sessionId}` : "Local Game"}
          </p>
        </div>
        <div className="text-right space-y-2">
          {sessionId && (
            <div className="flex items-center justify-end gap-2 text-sm">
              {connectionMode === "ws" && isConnected ? (
                <>
                  <Wifi size={16} style={{ color: "#10b981" }} />
                  <span style={{ color: "#10b981" }}>Live</span>
                </>
              ) : connectionMode === "polling" ? (
                <>
                  <Wifi size={16} style={{ color: "#f59e0b" }} />
                  <span style={{ color: "#f59e0b" }}>Polling</span>
                </>
              ) : (
                <>
                  <WifiOff
                    size={16}
                    style={{ color: "var(--color-error)" }}
                  />
                  <span style={{ color: "var(--color-error)" }}>
                    Connecting…
                  </span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 text-lg font-bold">
            <Clock size={24} />
            <span
              style={{
                color:
                  (gameState?.timer || 0) < 5
                    ? "var(--color-status-danger)"
                    : "var(--color-text-primary)",
              }}
            >
              {gameState?.timer || "30"}s
            </span>
          </div>
        </div>
      </div>

      {questions.length > 0 && (
        <GlassCard className="p-4 flex justify-between items-center bg-blue-500/5">
          <span className="font-semibold text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Progress: Question <strong>{currentQuestionIndex + 1}</strong> of <strong>{questions.length}</strong>
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-500/10 text-blue-500">
            Prompt: "{(gameState as any)?.starting_word || (gameState as any)?.session?.startingWord || (gameState as any)?.game?.starting_word}"
          </span>
        </GlassCard>
      )}

      {/* Current Word Display */}
      <GlassCard className="p-12 text-center border-2 border-blue-500/50">
        <p
          style={{ color: "var(--color-text-secondary)" }}
          className="text-sm uppercase mb-4"
        >
          Current Word
        </p>
        <h2
          className="text-6xl font-bold font-display"
          style={{ color: "var(--color-brand-blue)" }}
        >
          {lastWord}
        </h2>
        <p
          style={{ color: "var(--color-text-secondary)" }}
          className="mt-4 text-sm"
        >
          Next word must start with:{" "}
          <strong style={{ fontSize: "1.2em" }}>{requiredLetter}</strong>
        </p>
      </GlassCard>

      {/* Current Player Indicator */}
      <div className="text-center">
        <GlassCard className="inline-block px-6 py-3">
          <p
            style={{ color: "var(--color-text-secondary)" }}
            className="text-sm"
          >
            {isCurrentPlayerTurn ? "Your Turn!" : "Current Player"}
          </p>
          <p
            className="text-xl font-bold"
            style={{
              color: isCurrentPlayerTurn
                ? "var(--color-status-success)"
                : "var(--color-text-secondary)",
            }}
          >
            {currentPlayer?.name || "Waiting..."}
          </p>
        </GlassCard>
      </div>

      {/* Word Input — always visible for players, disabled when not their turn */}
      {(userType === "student" || isCurrentPlayerTurn) && (
        <div>
          {isCurrentPlayerTurn ? (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit}
              className="flex gap-3"
            >
              <input
                type="text"
                value={inputWord}
                onChange={(e) => setInputWord(e.target.value)}
                placeholder={`Enter a word starting with "${requiredLetter}"`}
                className="flex-1 px-4 py-3 rounded-lg border-2 focus:outline-none focus:border-blue-500"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-primary)",
                }}
                autoFocus
              />
              <button
                type="submit"
                disabled={!inputWord.trim()}
                className="px-6 py-3 rounded-lg font-semibold flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                  color: "white",
                }}
              >
                <Send size={18} />
                Submit
              </button>
            </motion.form>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-4 rounded-lg"
              style={{
                background: "var(--color-bg-tertiary)",
                border: "2px dashed var(--color-border)",
              }}
            >
              <Hourglass
                size={20}
                className="animate-pulse"
                style={{ color: "var(--color-text-secondary)" }}
              />
              <span
                className="font-semibold"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Waiting for{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {currentPlayer?.name || "other player"}
                </strong>{" "}
                to answer...
              </span>
            </motion.div>
          )}
        </div>
      )}

      {/* Teacher controls during active game */}
      {userType === "teacher" && (
        <div className="flex justify-end gap-3">
          {!isCurrentPlayerTurn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex items-center gap-3 p-4 rounded-lg"
              style={{
                background: "var(--color-bg-tertiary)",
                border: "2px dashed var(--color-border)",
              }}
            >
              <Hourglass
                size={20}
                className="animate-pulse"
                style={{ color: "var(--color-text-secondary)" }}
              />
              <span
                className="font-semibold"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Waiting for{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {currentPlayer?.name || "player"}
                </strong>
                ...
              </span>
            </motion.div>
          )}
          <button
            type="button"
            onClick={() => {
              if (syncEnabled) {
                wsEndGame();
              } else if (actions?.endGame) {
                actions.endGame();
              }
            }}
            className="px-6 py-3 rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
            }}
          >
            <Square size={18} />
            End Game
          </button>
          
          {questions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (syncEnabled) {
                  wsNextQuestion();
                }
              }}
              className="px-6 py-3 rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
              }}
            >
              <Play size={18} />
              Next Question
            </button>
          )}
        </div>
      )}

      {/* Student leave button */}
      {userType === "student" && onExit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onExit}
            className="px-4 py-2 rounded-lg font-semibold text-white flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(135deg, #6b7280, #4b5563)",
            }}
          >
            Leave Game
          </button>
        </div>
      )}

      {/* Error Message */}
      <AnimatePresence>
        {gameState?.errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex gap-3 p-4 rounded-lg text-red-500"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              borderLeft: "4px solid var(--color-status-danger)",
            }}
          >
            <AlertCircle size={20} className="flex-shrink-0" />
            <p>{gameState?.errorMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chain Display */}
      <GlassCard className="p-6">
        <h3
          style={{ color: "var(--color-text-primary)" }}
          className="font-bold mb-4"
        >
          Word Chain ({gameState?.chain?.length || 0})
        </h3>
        <div className="flex flex-wrap gap-2">
          {(gameState?.chain || []).map((word, index) => (
            <motion.div
              key={word.id ? `word-${word.id}` : `word-${index}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="px-3 py-2 rounded-full text-sm font-semibold"
              style={{
                background:
                  index === (gameState?.chain?.length || 0) - 1
                    ? "var(--color-brand-blue)"
                    : "var(--color-bg-tertiary)",
                color:
                  index === (gameState?.chain?.length || 0) - 1
                    ? "white"
                    : "var(--color-text-primary)",
              }}
            >
              {word.word}
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* Scoreboard */}
      <GlassCard className="p-6">
        <h3
          style={{ color: "var(--color-text-primary)" }}
          className="font-bold mb-4"
        >
          Scores
        </h3>
        <div className="space-y-2">
          {players.map((player, index) => (
            <div
              key={player.id ? `player-${player.id}` : `player-${index}`}
              className="flex justify-between items-center p-3 rounded-lg transition-colors"
              style={{
                background:
                  index === currentPlayerIndex
                    ? "var(--color-bg-tertiary)"
                    : "transparent",
              }}
            >
              <div className="flex items-center gap-2">
                {index === currentPlayerIndex && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--color-status-success)" }}
                  />
                )}
                <span
                  style={{ color: "var(--color-text-primary)" }}
                  className="font-semibold"
                >
                  {player.name}
                </span>
              </div>
              <div className="flex gap-4">
                <span style={{ color: "var(--color-text-secondary)" }}>
                  Words: {player.wordsValid ?? player.words_valid ?? 0}/
                  {player.wordsSubmitted ?? player.words_submitted ?? 0}
                </span>
                <span
                  className="font-bold"
                  style={{ color: "var(--color-brand-gold)" }}
                >
                  {player.score} pts
                </span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};
