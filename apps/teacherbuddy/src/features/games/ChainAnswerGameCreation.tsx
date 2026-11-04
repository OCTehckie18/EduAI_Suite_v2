import React, { useEffect, useState } from "react";
import { GlassCard } from "../../shared/components/GlassCard";
import { motion } from "framer-motion";
import {
  Play,
  Users,
  ArrowLeft,
  Loader,
  Copy,
  Share2,
  Check,
} from "lucide-react";
import { gameAPI } from "../../shared/utils/gameAPI";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { eduGamesUrl } from "../../shared/utils/eduGamesUrl";
import { useActiveStudents } from "./useActiveStudents";

type ChainVariation =
  | "standard"
  | "category"
  | "compound"
  | "ladder";

interface ChainAnswerGameCreationProps {
  onBack: () => void;
  onGameCreated?: (gameId: number, sessionId: string) => void;
}

export const ChainAnswerGameCreation: React.FC<
  ChainAnswerGameCreationProps
> = ({ onBack, onGameCreated }) => {
  const [gameConfig, setGameConfig] = useState({
    name: "New Game",
    chainVariation: "standard" as ChainVariation,
    category: "",
    subject: "",
    difficulty: "medium" as "easy" | "medium" | "hard",
    language: "en",
    startingWord: "Apple",
    timePerTurn: 30,
  });

  const [courses, setCourses] = useState<{ id: number; code?: string; name: string }[]>([]);
  const [coursesState, setCoursesState] = useState<"loading" | "ready" | "failed">("loading");
  const [courseId, setCourseId] = useState<number | null>(null);
  useEffect(() => {
    fetch(API_ENDPOINTS.COURSES)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load your courses"))))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCourses(list);
        setCoursesState("ready");
        setCourseId((current) => current ?? list[0]?.id ?? null);
      })
      .catch(() => setCoursesState("failed"));
  }, []);
  const {
    students: availableStudents,
    isLoading: loadingStudents,
    error: studentsError,
  } = useActiveStudents(courseId);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdGame, setCreatedGame] = useState<{
    id: number;
    session_id: string;
  } | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);


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

  const handleCreateGame = async () => {
    if (selectedPlayerIds.size < 2) {
      setError("Choose at least 2 players for the game.");
      return;
    }
    if (gameConfig.chainVariation === "category" && !gameConfig.category) {
      setError("Choose a category for this game type.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const selectedPlayers = availableStudents.filter((s) =>
        selectedPlayerIds.has(s.id),
      );

      // Create the game via backend API
      const gameData = {
        name: gameConfig.name,
        chain_variation: gameConfig.chainVariation,
        category:
          gameConfig.chainVariation === "category"
            ? gameConfig.category
            : undefined,
        difficulty_level: gameConfig.difficulty,
        language: gameConfig.language,
        subject: gameConfig.subject || undefined,
        starting_word: gameConfig.startingWord,
        time_per_turn: gameConfig.timePerTurn,
        penalty_on_invalid: false,
        players: selectedPlayers.map((p) => ({
          student_id: p.id,
        })),
      };

      // The game opens in a lobby. You start it from the next screen once the students are in.
      const game = await gameAPI.createGame(gameData);

      // Show success screen
      setCreatedGame({ id: game.id, session_id: game.session_id });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create game";
      setError(errorMessage);
      console.error("Error creating game:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // The server can check these topics: its own word lists, plus WordNet for animals, food and sports.
  const categories = ["Animals", "Food", "Sports", "Science", "Geography", "History", "Mathematics"];

  const copySessionToClipboard = () => {
    if (createdGame?.session_id) {
      navigator.clipboard.writeText(createdGame.session_id);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    }
  };

  const getGameLink = () => {
    if (createdGame?.session_id) {
      return eduGamesUrl(`/games/chain-answer/${createdGame.session_id}`);
    }
    return "";
  };

  // Success screen after game creation
  if (createdGame) {
    return (
      <div className="space-y-8">
        <GlassCard
          className="p-12 text-center border-2"
          style={{ borderColor: "var(--color-brand-blue)" }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="mb-6"
          >
            <Play
              size={64}
              className="mx-auto"
              style={{ color: "var(--color-brand-blue)" }}
            />
          </motion.div>
          <h2
            className="text-3xl font-bold mb-4 font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Game Created Successfully
          </h2>
          <p
            style={{ color: "var(--color-text-secondary)" }}
            className="text-lg mb-6"
          >
            {gameConfig.name}
          </p>

          {/* Session ID Display */}
          <div
            className="mb-8 p-6 rounded-lg"
            style={{ background: "var(--color-bg-tertiary)" }}
          >
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm mb-3 font-semibold"
            >
              SESSION ID
            </p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <code
                className="text-2xl font-bold font-mono px-4 py-2 rounded-lg"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-brand-blue)",
                }}
              >
                {createdGame.session_id}
              </code>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={copySessionToClipboard}
                className="p-2 rounded-lg transition-all"
                style={{
                  background: copiedToClipboard
                    ? "#10b981"
                    : "var(--color-bg-secondary)",
                  color: copiedToClipboard
                    ? "white"
                    : "var(--color-text-primary)",
                }}
              >
                {copiedToClipboard ? <Check size={20} /> : <Copy size={20} />}
              </motion.button>
            </div>
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-xs"
            >
              Students will enter this code to join the game
            </p>
          </div>

          {/* Game Link */}
          <div
            className="mb-8 p-6 rounded-lg"
            style={{ background: "var(--color-bg-tertiary)" }}
          >
            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm mb-3 font-semibold"
            >
              OR SHARE THIS LINK
            </p>
            <div className="flex items-center justify-center gap-2 overflow-hidden">
              <input
                type="text"
                value={getGameLink()}
                readOnly
                className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  navigator.clipboard.writeText(getGameLink());
                  setCopiedToClipboard(true);
                  setTimeout(() => setCopiedToClipboard(false), 2000);
                }}
                className="p-2 rounded-lg transition-all"
                style={{
                  background: "var(--color-brand-blue)",
                  color: "white",
                }}
              >
                <Share2 size={18} />
              </motion.button>
            </div>
          </div>

          {/* Game Info */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div
              className="p-4 rounded-lg"
              style={{ background: "var(--color-bg-tertiary)" }}
            >
              <p
                style={{ color: "var(--color-text-secondary)" }}
                className="text-xs mb-1"
              >
                Variation
              </p>
              <p
                style={{ color: "var(--color-text-primary)" }}
                className="font-bold"
              >
                {gameConfig.chainVariation}
              </p>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{ background: "var(--color-bg-tertiary)" }}
            >
              <p
                style={{ color: "var(--color-text-secondary)" }}
                className="text-xs mb-1"
              >
                Players
              </p>
              <p
                style={{ color: "var(--color-text-primary)" }}
                className="font-bold"
              >
                {selectedPlayerIds.size}
              </p>
            </div>
            <div
              className="p-4 rounded-lg"
              style={{ background: "var(--color-bg-tertiary)" }}
            >
              <p
                style={{ color: "var(--color-text-secondary)" }}
                className="text-xs mb-1"
              >
                Time/Turn
              </p>
              <p
                style={{ color: "var(--color-text-primary)" }}
                className="font-bold"
              >
                {gameConfig.timePerTurn}s
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setCreatedGame(null);
                onBack();
              }}
              className="flex-1 py-3 rounded-lg font-semibold"
              style={{
                background: "var(--color-bg-tertiary)",
                color: "var(--color-text-primary)",
              }}
            >
              Back to Games
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (onGameCreated) {
                  onGameCreated(createdGame.id, createdGame.session_id);
                }
              }}
              className="flex-1 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-brand-blue), var(--color-brand-blue-light))",
              }}
            >
              <Play size={20} />
              Open Lobby &amp; Start
            </motion.button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
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
            Create Chain Answer Game
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }} className="mt-2">
            Configure your game and invite students to play
          </p>
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Game Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Game Name & Basic Settings */}
          <GlassCard className="p-6">
            <h2
              className="text-xl font-bold mb-6"
              style={{ color: "var(--color-text-primary)" }}
            >
              Game Settings
            </h2>

            <div className="space-y-4">
              {/* Game Name */}
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Game Name
                </label>
                <input
                  type="text"
                  value={gameConfig.name}
                  onChange={(e) =>
                    setGameConfig({ ...gameConfig, name: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter game name"
                />
              </div>

              {/* Chain Variation */}
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Chain Rule
                </label>
                <select
                  value={gameConfig.chainVariation}
                  onChange={(e) =>
                    setGameConfig({
                      ...gameConfig,
                      chainVariation: e.target.value as ChainVariation,
                    })
                  }
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="standard">
                    Standard (Last letter → First letter)
                  </option>
                  <option value="category">
                    Category (Animals, Objects, etc.)
                  </option>
                  <option value="compound">
                    Compound (Last 2+ letters match)
                  </option>
                  <option value="ladder">
                    Ladder (Same length, 1 letter change)
                  </option>
                </select>
              </div>

              {/* Category (if selected) */}
              {gameConfig.chainVariation === "category" && (
                <div>
                  <label
                    className="block text-sm font-semibold mb-2"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Select Category
                  </label>
                  <select
                    value={gameConfig.category}
                    onChange={(e) =>
                      setGameConfig({ ...gameConfig, category: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Difficulty */}
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Difficulty
                </label>
                <div className="flex gap-3">
                  {(["easy", "medium", "hard"] as const).map((level) => (
                    <motion.button
                      key={level}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() =>
                        setGameConfig({
                          ...gameConfig,
                          difficulty: level,
                        })
                      }
                      className={`px-5 py-3 rounded-lg font-semibold transition-all capitalize flex-1 ${
                        gameConfig.difficulty === level
                          ? "text-white shadow-lg"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                      style={{
                        background:
                          gameConfig.difficulty === level
                            ? "linear-gradient(135deg, var(--color-brand-blue), var(--color-brand-blue-light))"
                            : undefined,
                      }}
                    >
                      {level}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Starting Word */}
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Starting Word
                </label>
                <input
                  type="text"
                  value={gameConfig.startingWord}
                  onChange={(e) =>
                    setGameConfig({
                      ...gameConfig,
                      startingWord: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter starting word (e.g., Apple)"
                />
              </div>

              {/* Subject (for topic-based word generation) */}
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Subject (Optional — Topic Filter)
                </label>
                <input
                  type="text"
                  value={gameConfig.subject}
                  onChange={(e) =>
                    setGameConfig({
                      ...gameConfig,
                      subject: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="e.g., Science, Animals, History, Mathematics"
                />
                <p
                  style={{ color: "var(--color-text-secondary)" }}
                  className="text-xs mt-2"
                >
                  Note: Providing a subject filters word suggestions to match the
                  topic
                </p>
              </div>

              {/* Time Per Turn */}
              <div>
                <label
                  className="block text-sm font-semibold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Time Per Turn (seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={gameConfig.timePerTurn}
                  onChange={(e) =>
                    setGameConfig({
                      ...gameConfig,
                      timePerTurn: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-gray-900 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right: Players Management */}
        <div className="space-y-6">
          {/* Select Players */}
          <GlassCard className="p-6">
            <h2
              className="text-xl font-bold mb-4"
              style={{ color: "var(--color-text-primary)" }}
            >
              <div className="flex items-center gap-2">
                <Users size={20} />
                Select Players
              </div>
            </h2>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Course</label>
            <select
              value={courseId ?? ""}
              onChange={(e) => {
                setCourseId(e.target.value ? Number(e.target.value) : null);
                setSelectedPlayerIds(new Set());
              }}
              disabled={courses.length === 0}
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
            >
              {courses.length === 0 && (
                <option value="">{coursesState === "loading" ? "Loading your courses..." : coursesState === "failed" ? "Could not load your courses" : "You have no courses yet"}</option>
              )}
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.code ? `${course.code} - ` : ""}{course.name}</option>
              ))}
            </select>

            {/* Loading State */}
            {loadingStudents && (
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
                <p className="text-sm font-semibold">Error loading students</p>
                <p className="text-xs">{studentsError}</p>
              </div>
            )}

            {/* Student List */}
            {!loadingStudents && availableStudents.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
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
            {!loadingStudents &&
              availableStudents.length === 0 &&
              !studentsError && (
                <div
                  className="p-4 rounded-lg text-center mb-4"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <p className="text-sm">No active students available</p>
                </div>
              )}

            <p
              style={{ color: "var(--color-text-secondary)" }}
              className="text-sm"
            >
              Selected Players: <strong>{selectedPlayerIds.size}</strong>
            </p>

            {selectedPlayerIds.size < 2 && (
              <p
                className="text-sm mt-2"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Select at least 2 players to create the game
              </p>
            )}
          </GlassCard>

          {/* Error Message */}
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

          {/* Create Game Button */}
          <motion.button
            whileHover={
              selectedPlayerIds.size >= 2 && !isLoading ? { scale: 1.05 } : {}
            }
            whileTap={
              selectedPlayerIds.size >= 2 && !isLoading ? { scale: 0.95 } : {}
            }
            onClick={handleCreateGame}
            disabled={selectedPlayerIds.size < 2 || isLoading}
            className="w-full px-6 py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            style={{
              background:
                selectedPlayerIds.size < 2 || isLoading
                  ? "#9ca3af"
                  : "linear-gradient(135deg, #10b981, #059669)",
              boxShadow:
                selectedPlayerIds.size < 2 || isLoading
                  ? "none"
                  : "0 10px 25px rgba(16, 185, 129, 0.3)",
            }}
          >
            {isLoading ? (
              <>
                <Loader size={20} className="animate-spin" />
                Creating Game...
              </>
            ) : (
              <>
                <Play size={20} />
                Create Game
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};
