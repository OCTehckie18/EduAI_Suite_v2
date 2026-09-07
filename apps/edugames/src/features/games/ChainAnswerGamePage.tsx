import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { ChainGameBoard } from "./ChainGameBoard";
import { useAuthStore } from "../../store/useAuthStore";
import { ChainAnswerGameJoinPage } from "./ChainAnswerGameJoinPage";
import { useActiveStudents } from "./useActiveStudents";
import { loadChainAnswerPlayerSession } from "./chainAnswerPlayerSession";
import type { ChainVariation } from "./types";
import { motion } from "framer-motion";
import { Play, Users, Lock, Loader, Check } from "lucide-react";
import { gameAPI } from "../../shared/utils/gameAPI";

export const ChainAnswerGamePage: React.FC = () => {
  try {
    const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
    const { role } = useAuthStore();
    const [gameStarted, setGameStarted] = useState(false);
    const storedPlayerSession = loadChainAnswerPlayerSession();
    const [joinedGameId, setJoinedGameId] = useState<number | null>(
      storedPlayerSession?.gameId ?? null,
    );
    const [joinedSessionId, setJoinedSessionId] = useState<string | null>(
      storedPlayerSession?.sessionId ?? null,
    );
    const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(
      storedPlayerSession?.playerId ?? null,
    );
    const [joinedPlayerName, setJoinedPlayerName] = useState<string | null>(
      storedPlayerSession?.playerName ?? null,
    );
    const [courseId, setCourseId] = useState<number>(1);

    // Fetch active students from backend
    const {
      students: availableStudents,
      isLoading,
      error: studentsError,
    } = useActiveStudents(courseId);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(
      new Set(),
    );

    const [gameConfig, setGameConfig] = useState({
      name: "New Game",
      chainVariation: "standard" as ChainVariation,
      category: "",
      difficulty: "medium" as "easy" | "medium" | "hard",
      language: "en",
      startingWord: "Apple",
    });

    const [questions, setQuestions] = useState<string[]>([""]);

    // No longer using local useChainGameState — teacher uses WebSocket sync via ChainGameBoard

    const handleTogglePlayer = (studentId: number) => {
      setSelectedPlayerIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(studentId)) {
          newSet.delete(studentId);
        } else {
          newSet.add(studentId);
        }
        return newSet;
      });
    };

    const handleStartGame = async () => {
      if (selectedPlayerIds.size < 2) return;

      const selectedPlayers = availableStudents
        .filter((s) => selectedPlayerIds.has(s.id))
        .map((s) => ({ student_id: s.id }));

      const formattedQuestions = questions
        .map((q) => q.trim())
        .filter((q) => q.length > 0)
        .map((q) => ({ question_text: q }));

      try {
        const game = await gameAPI.createGame({
          name: gameConfig.name,
          chain_variation: gameConfig.chainVariation,
          category: gameConfig.category,
          difficulty_level: gameConfig.difficulty,
          language: gameConfig.language,
          starting_word: formattedQuestions[0]?.question_text || gameConfig.startingWord,
          time_per_turn: 30,
          penalty_on_invalid: false,
          players: selectedPlayers,
          questions: formattedQuestions,
        });

        setJoinedGameId(game.id);
        setJoinedSessionId(game.session_id);
        setGameStarted(true);
      } catch (err) {
        console.error("Failed to start game:", err);
        alert("Failed to create game on server. Please try again.");
      }
    };

    const activeSessionId = urlSessionId || joinedSessionId;
    const hasStudentIdentity = Boolean(
      activeSessionId &&
      joinedSessionId === activeSessionId &&
      joinedGameId !== null &&
      joinedPlayerId &&
      joinedPlayerName,
    );

    const handleStudentJoined = (session: {
      gameId: number;
      sessionId: string;
      playerId: string;
      playerName: string;
    }) => {
      setJoinedGameId(session.gameId);
      setJoinedSessionId(session.sessionId);
      setJoinedPlayerId(session.playerId);
      setJoinedPlayerName(session.playerName);
    };

    // If student and we have a stable session identity, show game board with sync
    if (role === "student" && activeSessionId && hasStudentIdentity) {
      return (
        <ChainGameBoard
          gameId={joinedGameId || 0}
          sessionId={activeSessionId}
          playerId={joinedPlayerId || ""}
          playerName={joinedPlayerName || ""}
          userType="student"
          onError={(err) => {
            console.error("Game sync error:", err);
            // Clear stale session
            setJoinedSessionId(null);
            setJoinedGameId(null);
            setJoinedPlayerId(null);
            setJoinedPlayerName(null);
            localStorage.removeItem("chain_answer_player_session");
          }}
          onGameEnded={() => {
            // Allow ChainGameBoard to show its own final standings screen
          }}
          onExit={() => {
            setJoinedSessionId(null);
            setJoinedGameId(null);
            setJoinedPlayerId(null);
            setJoinedPlayerName(null);
            localStorage.removeItem("chain_answer_player_session");
          }}
        />
      );
    }
    // Removed gameEndedScreen static view to use the board's rich final standings screen
    // If student without a stable player identity, show join form
    if (role === "student") {
      return (
        <ChainAnswerGameJoinPage
          initialSessionId={urlSessionId ?? joinedSessionId ?? ""}
          onJoined={handleStudentJoined}
        />
      );
    }

    // If role is not set, show role selector
    if (!role) {
      return (
        <div className="space-y-8">
          <div>
            <h1
              className="text-4xl font-bold font-display"
              style={{ color: "var(--color-text-primary)" }}
            >
              Chain Answer Game
            </h1>
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="mt-2"
            >
              Select your role to continue
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            {/* Teacher Option */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const { setRole } = useAuthStore.getState();
                setRole("teacher");
              }}
              className="cursor-pointer"
            >
              <GlassCard className="p-8 h-full text-center hover:shadow-lg transition-shadow">
                <Users
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: "var(--color-brand-blue)" }}
                />
                <h3
                  className="text-xl font-bold mb-2 font-display"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Teacher
                </h3>
                <p
                  style={{ color: "var(--color-text-secondary)" }}
                  className="text-sm mb-4"
                >
                  Create and manage games
                </p>
                <button
                  className="px-6 py-2 rounded-lg font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                  }}
                >
                  Enter as Teacher
                </button>
              </GlassCard>
            </motion.div>

            {/* Student Option */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                const { setRole } = useAuthStore.getState();
                setRole("student");
              }}
              className="cursor-pointer"
            >
              <GlassCard className="p-8 h-full text-center hover:shadow-lg transition-shadow">
                <Play
                  size={48}
                  className="mx-auto mb-4"
                  style={{ color: "var(--color-brand-blue)" }}
                />
                <h3
                  className="text-xl font-bold mb-2 font-display"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Student
                </h3>
                <p
                  style={{ color: "var(--color-text-secondary)" }}
                  className="text-sm mb-4"
                >
                  Join a game
                </p>
                <button
                  className="px-6 py-2 rounded-lg font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                  }}
                >
                  Join Game
                </button>
              </GlassCard>
            </motion.div>
          </div>
        </div>
      );
    }

    // Show game board if started — teacher uses WebSocket sync
    if (gameStarted && joinedGameId && joinedSessionId) {
      return (
        <ChainGameBoard
          gameId={joinedGameId}
          sessionId={joinedSessionId}
          userType="teacher"
          onError={(err) => console.error("Game sync error:", err)}
          onGameEnded={() => {
            // Allow ChainGameBoard to show its own final standings screen
          }}
          onExit={() => {
            setGameStarted(false);
            setJoinedSessionId(null);
            setJoinedGameId(null);
          }}
        />
      );
    }

    // Teacher setup page
    if (!role || role !== "teacher") {
      return (
        <div className="space-y-8">
          <GlassCard className="p-8 border-red-200 bg-red-50">
            <div className="flex items-center gap-4">
              <Lock size={32} style={{ color: "var(--color-error)" }} />
              <div>
                <h2
                  style={{ color: "var(--color-error)" }}
                  className="font-bold text-lg"
                >
                  Access Denied
                </h2>
                <p style={{ color: "var(--color-text-secondary)" }}>
                  Only teachers can set up games. Please log in as a teacher.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      );
    }

    // Show setup page
    return (
      <div className="space-y-8">
        <div>
          <h1
            className="text-4xl font-bold font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Chain Answer Game Setup
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }} className="mt-2">
            Configure your game and select students to play
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Game Configuration */}
          <div className="lg:col-span-2 space-y-6">
            <GlassCard className="p-6">
              <h2
                className="text-xl font-bold mb-6"
                style={{ color: "var(--color-text-primary)" }}
              >
                Game Configuration
              </h2>

              {/* Game Name */}
              <div className="mb-6">
                <label
                  style={{ color: "var(--color-text-secondary)" }}
                  className="block text-sm font-semibold mb-2"
                >
                  Game Name
                </label>
                <input
                  type="text"
                  value={gameConfig.name}
                  onChange={(e) =>
                    setGameConfig({ ...gameConfig, name: e.target.value })
                  }
                  className="w-full px-4 py-2 rounded-lg border-2 focus:outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              {/* Chain Variation */}
              <div className="mb-6">
                <label
                  style={{ color: "var(--color-text-secondary)" }}
                  className="block text-sm font-semibold mb-2"
                >
                  Chain Variation
                </label>
                <select
                  value={gameConfig.chainVariation}
                  onChange={(e) =>
                    setGameConfig({
                      ...gameConfig,
                      chainVariation: e.target.value as ChainVariation,
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border-2 focus:outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <option value="standard">
                    Standard (Last letter → First letter)
                  </option>
                  <option value="category">
                    Category (Animals, Objects, etc.)
                  </option>
                  <option value="ladder">
                    Word Ladder (Change one letter)
                  </option>
                  <option value="compound">Compound (Overlapping words)</option>
                  <option value="geography">
                    Geography (Cities/Countries)
                  </option>
                </select>
              </div>

              {/* Category */}
              {gameConfig.chainVariation === "category" && (
                <div className="mb-6">
                  <label
                    style={{ color: "var(--color-text-secondary)" }}
                    className="block text-sm font-semibold mb-2"
                  >
                    Category
                  </label>
                  <select
                    value={gameConfig.category}
                    onChange={(e) =>
                      setGameConfig({ ...gameConfig, category: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border-2 focus:outline-none"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <option value="">Select a category</option>
                    <option value="animals">Animals</option>
                    <option value="objects">Objects</option>
                    <option value="fruits">Fruits</option>
                    <option value="colors">Colors</option>
                  </select>
                </div>
              )}

              {/* Difficulty */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <label
                    style={{ color: "var(--color-text-secondary)" }}
                    className="block text-sm font-semibold mb-2"
                  >
                    Difficulty
                  </label>
                  <select
                    value={gameConfig.difficulty}
                    onChange={(e) =>
                      setGameConfig({
                        ...gameConfig,
                        difficulty: e.target.value as
                          | "easy"
                          | "medium"
                          | "hard",
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg border-2 focus:outline-none"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                {/* Starting Word */}
                <div>
                  <label
                    style={{ color: "var(--color-text-secondary)" }}
                    className="block text-sm font-semibold mb-2"
                  >
                    Starting Word
                  </label>
                  <input
                    type="text"
                    value={gameConfig.startingWord}
                    disabled={questions.filter(q => q.trim().length > 0).length > 0}
                    onChange={(e) =>
                      setGameConfig({
                        ...gameConfig,
                        startingWord: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 rounded-lg border-2 focus:outline-none disabled:opacity-50"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
              </div>

              {/* Multiple Questions/Prompts Section */}
              <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--color-border)" }}>
                <h3
                  className="text-lg font-bold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Game Questions / Prompts (Optional)
                </h3>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
                  If you add prompts here, students will play multiple questions sequentially. If left empty, the game will play a single question using the "Starting Word" above.
                </p>

                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-sm font-bold text-slate-500 w-6">#{idx + 1}</span>
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => {
                          const updated = [...questions];
                          updated[idx] = e.target.value;
                          setQuestions(updated);
                        }}
                        placeholder={`e.g. Prompt #${idx + 1}`}
                        className="flex-1 px-4 py-2 rounded-lg border-2 focus:outline-none"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-bg-secondary)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuestions(questions.filter((_, i) => i !== idx));
                          }}
                          className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                        >
                          
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setQuestions([...questions, ""])}
                  className="mt-3 px-4 py-2 rounded-lg font-semibold text-xs border transition-colors hover:bg-blue-50"
                  style={{
                    borderColor: "var(--color-brand-blue)",
                    color: "var(--color-brand-blue)",
                    background: "transparent",
                  }}
                >
                  + Add Prompt
                </button>
              </div>
            </GlassCard>
          </div>

          {/* Right: Player Selection */}
          <div className="space-y-4">
            <GlassCard className="p-6">
              <h2
                className="text-xl font-bold mb-4 flex items-center gap-2"
                style={{ color: "var(--color-text-primary)" }}
              >
                <Users size={20} />
                Select Players
              </h2>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader
                    size={24}
                    className="animate-spin"
                    style={{ color: "var(--color-brand-blue)" }}
                  />
                </div>
              )}

              {/* Error State */}
              {studentsError && (
                <div
                  className="p-4 rounded-lg mb-4"
                  style={{
                    background: "var(--color-error-light)",
                    color: "var(--color-error)",
                  }}
                >
                  <p className="text-sm font-semibold">
                    Error loading students
                  </p>
                  <p className="text-xs">{studentsError}</p>
                </div>
              )}

              {/* Student List */}
              {!isLoading && availableStudents.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableStudents.map((student) => (
                    <motion.div
                      key={student.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center p-3 rounded-lg cursor-pointer hover:scale-105 transition-transform"
                      style={{
                        background: selectedPlayerIds.has(student.id)
                          ? "var(--color-brand-blue)"
                          : "var(--color-bg-tertiary)",
                      }}
                      onClick={() => handleTogglePlayer(student.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlayerIds.has(student.id)}
                        onChange={() => handleTogglePlayer(student.id)}
                        className="mr-3"
                      />
                      <span
                        style={{
                          color: selectedPlayerIds.has(student.id)
                            ? "white"
                            : "var(--color-text-primary)",
                        }}
                        className="font-semibold flex-1"
                      >
                        {student.name}
                      </span>
                      {selectedPlayerIds.has(student.id) && (
                        <Check size={16} style={{ color: "white" }} />
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {/* No Students State */}
              {!isLoading &&
                availableStudents.length === 0 &&
                !studentsError && (
                  <div
                    className="p-4 rounded-lg text-center"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <p className="text-sm">No active students available</p>
                  </div>
                )}

              <p
                style={{ color: "var(--color-text-secondary)" }}
                className="text-sm mt-4"
              >
                Selected Players: <strong>{selectedPlayerIds.size}</strong>
              </p>
            </GlassCard>

            {/* Start Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartGame}
              disabled={selectedPlayerIds.size < 2}
              className="w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 text-white text-lg hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{
                background:
                  selectedPlayerIds.size >= 2
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "gray",
              }}
            >
              <Play size={24} />
              Start Game
            </motion.button>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("ChainAnswerGamePage Error:", error);
    return (
      <div style={{ color: "red", padding: "20px", fontSize: "16px" }}>
        <h2>Error Loading Chain Answer Game</h2>
        <p>{String(error)}</p>
      </div>
    );
  }
};
