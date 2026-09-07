import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gamepad2,
  Users,
  BarChart,
  FlaskConical,
  Target,
  HardHat,
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { motion, AnimatePresence } from "framer-motion";

const gameCategories = [
  {
    id: "chain-answer",
    title: "Chain Answer Game",
    description:
      "One student starts an answer, the next continues it. Build collaborative responses chain by chain.",
    icon: Target,
    color: "from-orange-400 to-red-500",
  },
  {
    id: "word-cloud-battle",
    title: "Live Word Cloud Battle",
    description:
      "Ask open-ended questions and watch words appear live in an interactive word cloud powered by Mentimeter.",
    icon: BarChart,
    color: "from-emerald-400 to-teal-500",
  },
  {
    id: "quiz-battle-royale",
    title: "Quiz Battle Royale",
    description:
      "Students answer MCQs in real time. Points = speed + accuracy. Live leaderboard with Kahoot-style gameplay.",
    icon: Gamepad2,
    color: "from-blue-400 to-indigo-500",
  },
  // {
  //   id: "team-puzzle",
  //   title: "Team Puzzle Challenge",
  //   description:
  //     "Split the class into teams. Each member gets partial info. Collaborate to solve the complete puzzle.",
  //   icon: Users,
  //   color: "from-pink-400 to-rose-500",
  // },
  // {
  //   id: "slido-polling",
  //   title: "Slido — Live Polling & Q&A",
  //   description:
  //     "Live polling and Q&A integrated into presentations. Engage students in real-time feedback.",
  //   icon: BarChart,
  //   color: "from-purple-400 to-violet-500",
  // },
  // {
  //   id: "slido-join",
  //   title: "Join Live Session",
  //   description:
  //     "Enter a 6-digit PIN to join a classmate's live presentation. Vote on polls and ask questions in real-time.",
  //   icon: Users,
  //   color: "from-sky-400 to-blue-500",
  // },
  {
    id: "trello-projects",
    title: "Trello — Project Management",
    description:
      "Kanban-style boards for managing group projects and tasks. Organize work with cards and columns.",
    icon: FlaskConical,
    color: "from-red-400 to-orange-500",
  },
];

export const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold font-display"
          style={{ color: "var(--color-text-primary)" }}
        >
          EduGames Hub
        </h1>
        <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Interactive learning modules, live quizzes, and collaborative spaces.
        </p>
      </div>

      {/* Grid of game types */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gameCategories.map((category) => (
          <motion.div
            key={category.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (category.id === "chain-answer") {
                navigate("/games/chain-answer");
              } else if (category.id === "quiz-battle-royale") {
                navigate("/games/quiz/play");
              } else if (category.id === "trello-projects") {
                navigate("/games/trello");
              } else if (category.id === "word-cloud-battle") {
                navigate("/games/word-cloud");
              } else if (category.id === "slido-polling") {
                navigate("/games/slido/submit");
              } else if (category.id === "slido-join") {
                navigate("/games/slido/join");
              } else {
                setSelectedGame(category.id);
              }
            }}
            className="cursor-pointer"
          >
            <GlassCard className="h-full relative overflow-hidden group">
              <div
                className={`absolute inset-0 opacity-10 bg-gradient-to-br ${category.color} transition-opacity group-hover:opacity-20`}
              />
              <div className="p-6">
                <div
                  className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center bg-gradient-to-br ${category.color} text-white shadow-lg`}
                >
                  <category.icon size={24} />
                </div>
                <h3
                  className="text-lg font-bold mb-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {category.title}
                </h3>
                <p
                  className="text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {category.description}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Under Construction Modal */}
      <AnimatePresence>
        {selectedGame && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedGame(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg"
            >
              <GlassCard
                className="p-8 text-center border-t-4"
                style={{ borderTopColor: "var(--color-brand-gold)" }}
              >
                <div className="mx-auto w-20 h-20 bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center mb-6">
                  <HardHat size={40} />
                </div>
                <h2
                  className="text-2xl font-bold font-display mb-3"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Module Under Construction
                </h2>
                <p
                  className="mb-8 leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  The{" "}
                  <strong>
                    {gameCategories.find((c) => c.id === selectedGame)?.title}
                  </strong>{" "}
                  module is currently being built by our engineering team.
                  Please check back later for updates.
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => setSelectedGame(null)}
                    className="px-6 py-2.5 rounded-xl font-semibold text-white transition-transform hover:scale-105 active:scale-95"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-brand-blue), #3460c4)",
                      boxShadow: "0 4px 15px rgba(38,71,150,0.3)",
                    }}
                  >
                    Go Back
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
