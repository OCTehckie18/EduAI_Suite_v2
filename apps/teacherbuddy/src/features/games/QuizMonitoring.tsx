import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Users,
  ChevronRight,
  Trophy,
  Clock,
  Lock,
  Unlock,
  X,
  Sparkles,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { PlayerAvatar } from "../../shared/components/PlayerAvatar";
import { motion, AnimatePresence } from "framer-motion";

import { API_BASE_URL, authHeaders, buildWsUrl } from "../../shared/utils/apiConfig";

interface Player {
  id: number;
  nickname: string;
  avatar: string;
}

interface ScoreRow {
  id: number;
  nickname: string;
  avatar: string;
  score: number;
  rank: number;
  streak: number;
  answered: boolean;
  is_correct: boolean;
  gained: number;
}

type Phase = "lobby" | "active" | "result" | "completed";

const MAX_RECONNECTS = 5;

export const QuizMonitoring: React.FC = () => {
  // /games/quiz/host/:quizId starts a new game; /games/quiz/session/:pin returns to one already running.
  const { quizId, pin: pinParam } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState<string | null>(null);
  const [status, setStatus] = useState<Phase>("lobby");
  const [problem, setProblem] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [locked, setLocked] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreRow[]>([]);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [answerCount, setAnswerCount] = useState(0);
  const [playersTotal, setPlayersTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [correctOptionIds, setCorrectOptionIds] = useState<number[]>([]);
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>([]);
  const [typedAnswers, setTypedAnswers] = useState<{ text: string; count: number; is_correct: boolean }[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnects = useRef(0);
  const leaving = useRef(false);
  const sessionLookup = useRef<Promise<string | null> | null>(null);

  const connectWebSocket = useCallback((gamePin: string) => {
    const query = new URLSearchParams({
      user_type: "teacher",
      access_token: localStorage.getItem("token") || "",
    });
    const ws = new WebSocket(buildWsUrl(`/ws/quiz/${gamePin}?${query.toString()}`));
    socketRef.current = ws;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      reconnects.current = 0;
      setProblem("");
    };
    ws.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "lobby_update":
          setPlayers(message.players);
          setLocked(!!message.locked);
          break;
        case "new_question":
          setCurrentQuestion(message.question);
          setQuestionIndex(message.index);
          setTotalQuestions(message.total);
          setDeadline(Date.now() + (message.question.time_left ?? message.question.time_limit ?? 20) * 1000);
          setAnswerCount(0);
          setStats({});
          setStatus("active");
          break;
        case "answer_count_update":
          setAnswerCount(message.count);
          setPlayersTotal(message.players_total);
          break;
        case "show_results":
          setStats(message.stats || {});
          setCorrectOptionIds(message.correct_option_ids || []);
          setAcceptedAnswers(message.accepted_answers || []);
          setTypedAnswers(message.typed_answers || []);
          setScoreboard(message.scoreboard || []);
          setAnswerCount(message.answered ?? 0);
          setPlayersTotal(message.players_total ?? 0);
          setStatus("result");
          break;
        case "game_over":
          setLeaderboard(message.leaderboard);
          setStatus("completed");
          leaving.current = true;
          break;
        case "error":
          setProblem(message.message || "Something went wrong.");
          break;
      }
    };
    ws.onclose = () => {
      if (socketRef.current === ws) socketRef.current = null;
      if (leaving.current) return;
      if (!opened) {
        setProblem("Could not connect to the game. Check your connection and sign in again if this keeps happening.");
        return;
      }
      if (reconnects.current < MAX_RECONNECTS) {
        reconnects.current += 1;
        setProblem("Connection lost. Reconnecting...");
        window.setTimeout(() => {
          if (!leaving.current) connectWebSocket(gamePin);
        }, 1500);
      } else {
        setProblem("Connection lost. Reload this page to reconnect.");
      }
    };
  }, []);

  // Looks up (or creates) the game once, even though development mode runs effects twice.
  const resolveSession = useCallback(async (): Promise<string | null> => {
    try {
      if (pinParam) {
        const res = await fetch(`${API_BASE_URL}/quizzes/sessions/${encodeURIComponent(pinParam)}`, { headers: authHeaders() });
        if (!res.ok) {
          setProblem("That game could not be found. It may belong to another teacher or have been deleted.");
          return null;
        }
        return pinParam;
      }
      const res = await fetch(`${API_BASE_URL}/quizzes/${quizId}/session`, { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.pin) {
        setProblem(data.detail || "Could not start this quiz. Check that it exists and that you own it.");
        return null;
      }
      // A refresh now returns to this game instead of starting another one.
      window.history.replaceState(null, "", `/games/quiz/session/${data.pin}`);
      return data.pin;
    } catch {
      setProblem("Could not reach the server. Check your connection and try again.");
      return null;
    }
  }, [pinParam, quizId]);

  useEffect(() => {
    leaving.current = false;
    sessionLookup.current ??= resolveSession();
    sessionLookup.current.then((gamePin) => {
      if (!gamePin || leaving.current) return;
      setPin(gamePin);
      connectWebSocket(gamePin);
    });
    return () => {
      leaving.current = true;
      socketRef.current?.close();
    };
  }, [resolveSession, connectWebSocket]);

  useEffect(() => {
    if (status !== "active") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const send = (message: object) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setProblem("Not connected to the game right now.");
      return;
    }
    socket.send(JSON.stringify(message));
  };

  const timer = Math.max(0, Math.ceil((deadline - now) / 1000));

  if (problem && !pin) {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-8 text-white text-center gap-6">
        <p role="alert" className="text-2xl font-black max-w-xl">{problem}</p>
        <button onClick={() => navigate("/games/quiz")} className="px-10 py-4 bg-white text-[#46178f] rounded-2xl font-black text-xl">
          Back to quizzes
        </button>
      </div>
    );
  }

  const banner = problem ? (
    <div role="alert" className="absolute top-0 inset-x-0 z-20 bg-red-600 text-white text-center font-bold py-2 text-sm">
      {problem}
    </div>
  ) : null;

  if (status === "lobby") {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-8 text-white overflow-hidden relative">
        {banner}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute"
              initial={{ x: Math.random() * 100 + "%", y: Math.random() * 100 + "%" }}
              animate={{ y: [0, -20, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3 + Math.random() * 2, repeat: Infinity }}
            >
              <Sparkles size={20 + Math.random() * 20} />
            </motion.div>
          ))}
        </div>

        <div className="max-w-4xl w-full space-y-12 z-10">
          <div className="flex flex-col items-center gap-6">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border-b-8 border-gray-200"
            >
              <p className="text-[#46178f] text-2xl font-black uppercase tracking-widest">Game PIN:</p>
              <h1 className="text-[#46178f] text-9xl font-black tracking-tighter">{pin || "------"}</h1>
            </motion.div>

            <div className="flex items-center gap-6 flex-wrap justify-center">
              <div className="bg-white/10 backdrop-blur-md px-8 py-4 rounded-2xl border border-white/20 flex items-center gap-4">
                <Users size={32} />
                <span className="text-4xl font-black">{players.length}</span>
              </div>
              <button
                onClick={() => send({ type: "lock_lobby", locked: !locked })}
                className="px-6 py-4 bg-white/10 border border-white/30 rounded-2xl font-black flex items-center gap-2 hover:bg-white/20"
              >
                {locked ? <Unlock size={22} /> : <Lock size={22} />}
                {locked ? "Unlock game" : "Lock game"}
              </button>
              <button
                onClick={() => send({ type: "start_game" })}
                disabled={players.length === 0}
                className="px-16 py-6 bg-white text-[#46178f] rounded-2xl text-3xl font-black shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                START
              </button>
            </div>
            {locked && <p className="font-bold text-purple-200">The game is locked. Nobody new can join.</p>}
            {players.length === 0 && <p className="font-bold text-purple-200">Waiting for players. Ask them to enter this PIN.</p>}
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-6 max-h-[40vh] overflow-y-auto p-4 custom-scrollbar">
            <AnimatePresence>
              {players.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="relative bg-white/10 backdrop-blur-sm border border-white/10 p-4 rounded-2xl text-center flex flex-col items-center gap-2 group"
                >
                  <button
                    onClick={() => send({ type: "kick_player", player_id: p.id })}
                    aria-label={`Remove ${p.nickname}`}
                    title={`Remove ${p.nickname}`}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/40 hover:bg-red-600 flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                  <PlayerAvatar avatar={p.avatar} size={56} />
                  <span className="font-black truncate w-full">{p.nickname}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  if ((status === "active" || status === "result") && currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col animate-fade-in relative">
        {banner}
        <div className="bg-white border-b p-6 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
              {questionIndex + 1}
            </div>
            <h2 className={`font-black text-gray-800 ${currentQuestion.image_url ? "text-3xl" : "text-5xl"}`}>{currentQuestion.text}</h2>
          </div>
          <div className="flex items-center gap-8">
            {status === "active" && (
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase text-gray-400">Answers</span>
                <span className="text-4xl font-black text-purple-600">
                  {answerCount}
                  {playersTotal > 0 && <span className="text-2xl text-gray-400">/{playersTotal}</span>}
                </span>
              </div>
            )}
            <div
              className={`w-24 h-24 rounded-full border-8 flex items-center justify-center text-4xl font-black transition-all ${
                timer < 5 && status === "active" ? "border-red-500 text-red-500 animate-pulse" : "border-purple-600 text-purple-600"
              }`}
            >
              {status === "active" ? timer : <Clock size={32} />}
            </div>
            <button
              onClick={() => send({ type: "next_question" })}
              className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-purple-700 transition-all flex items-center gap-2 text-xl"
            >
              {status === "result" ? (questionIndex + 1 >= totalQuestions ? "Finish" : "Next") : "Skip"} <ChevronRight size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-12 flex flex-col items-center justify-center gap-10 overflow-hidden">
          {currentQuestion.image_url ? (
            <div className="w-full max-w-3xl aspect-video bg-white rounded-3xl shadow-2xl overflow-hidden border-8 border-white">
              <img src={currentQuestion.image_url} alt="Question" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="h-10" />
          )}

          {currentQuestion.question_type === "multi" && status === "active" && (
            <p className="text-xl font-black uppercase tracking-widest text-purple-600">Select all that apply</p>
          )}
          {currentQuestion.question_type === "typed" && (
            <div className="w-full max-w-3xl rounded-3xl bg-white p-8 text-center shadow-xl space-y-4">
              {status === "active" ? (
                <p className="text-3xl font-black text-purple-700">Players are typing their answers</p>
              ) : (
                <>
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">Accepted answers</p>
                  <p className="text-3xl font-black text-green-700">{acceptedAnswers.join("  ·  ") || "None set"}</p>
                  {typedAnswers.length > 0 && (
                    <ul className="space-y-1 pt-2 text-left">
                      {typedAnswers.map((a) => (
                        <li key={a.text} className="flex justify-between rounded-xl bg-gray-50 px-4 py-2 text-lg font-bold">
                          <span className={a.is_correct ? "text-green-700" : "text-gray-700"}>
                            {a.text} {a.is_correct && "✓"}
                          </span>
                          <span>{a.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div className={`grid grid-cols-2 gap-6 w-full max-w-7xl ${status === "result" ? "opacity-90" : ""} ${currentQuestion.question_type === "typed" ? "hidden" : ""}`}>
            {currentQuestion.options.map((opt: any, idx: number) => {
              const count = stats[String(opt.id)] || 0;
              const isRight = correctOptionIds.includes(opt.id);
              return (
                <div
                  key={opt.id}
                  className={`relative h-32 rounded-3xl shadow-xl flex items-center px-10 text-white text-3xl font-black gap-8 transition-all overflow-hidden ${
                    status === "result" && !isRight ? "opacity-40 grayscale-[0.5]" : ""
                  }`}
                  style={{ backgroundColor: opt.color || "#333" }}
                >
                  <div className="w-12 h-12 border-4 border-white/40 rounded-xl flex items-center justify-center shrink-0">
                    {idx === 0 && <div className="w-6 h-6 bg-white rotate-45" />}
                    {idx === 1 && <div className="w-6 h-6 bg-white rounded-full" />}
                    {idx === 2 && <div className="w-6 h-6 bg-white -rotate-45" />}
                    {idx === 3 && <div className="w-6 h-6 bg-white" />}
                  </div>
                  <span className="flex-1 truncate">{opt.text}</span>
                  {status === "result" && (
                    <div className="absolute inset-y-0 right-0 w-32 bg-black/30 flex flex-col items-center justify-center">
                      <span className="text-4xl">{count}</span>
                      {isRight && <span className="text-xs font-black uppercase tracking-widest text-green-300">Correct</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {status === "result" && scoreboard.length > 0 && (
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-4 space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 text-center">Top of the board</p>
              {scoreboard.slice(0, 5).map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-2 font-bold text-gray-800">
                  <span className="flex items-center gap-3">
                    <span className="w-6 text-center font-black text-gray-400">{row.rank}</span>
                    <PlayerAvatar avatar={row.avatar} size={28} />
                    {row.nickname}
                    {row.streak >= 2 && <span className="text-xs font-black text-orange-500">{row.streak} in a row</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    {row.gained > 0 && <span className="text-sm font-black text-green-600">+{row.gained}</span>}
                    <span className="font-black">{row.score}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border-t p-4 flex justify-between items-center text-gray-400 font-black text-lg">
          <span>
            Question {questionIndex + 1} of {totalQuestions}
          </span>
          <div className="bg-[#46178f] text-white px-8 py-2 rounded-full font-black shadow-lg">PIN: {pin}</div>
        </div>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-8 text-white animate-fade-in overflow-hidden relative">
        <Trophy size={120} className="text-yellow-400 mb-8 animate-bounce" />
        <h1 className="text-8xl font-black mb-16 italic tracking-tighter shadow-text">
          PODIUM
        </h1>

        <div className="flex items-end gap-6 max-w-5xl w-full h-[50vh]">
          {leaderboard[1] && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex-1 flex flex-col items-center gap-4"
            >
              <div className="flex flex-col items-center">
                <span className="mb-2"><PlayerAvatar avatar={leaderboard[1].avatar} size={72} /></span>
                <span className="text-2xl font-black">
                  {leaderboard[1].nickname}
                </span>
              </div>
              <div className="w-full bg-white/20 h-48 rounded-t-3xl flex flex-col items-center justify-center text-5xl font-black border-x-4 border-t-4 border-white/30">
                2
                <span className="text-sm font-bold opacity-60 mt-2">
                  {leaderboard[1].score} pts
                </span>
              </div>
            </motion.div>
          )}

          {leaderboard[0] && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex-1 flex flex-col items-center gap-4"
            >
              <div className="flex flex-col items-center">
                <span className="mb-4 animate-bounce">
                  <PlayerAvatar avatar={leaderboard[0].avatar} size={104} />
                </span>
                <span className="text-4xl font-black text-yellow-400">
                  {leaderboard[0].nickname}
                </span>
              </div>
              <div className="w-full bg-yellow-400 text-[#46178f] h-80 rounded-t-3xl flex flex-col items-center justify-center shadow-2xl">
                <span className="text-9xl font-black">1</span>
                <span className="text-xl font-black opacity-80">
                  {leaderboard[0].score} pts
                </span>
              </div>
            </motion.div>
          )}

          {leaderboard[2] && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex-1 flex flex-col items-center gap-4"
            >
              <div className="flex flex-col items-center">
                <span className="mb-2"><PlayerAvatar avatar={leaderboard[2].avatar} size={64} /></span>
                <span className="text-xl font-black">
                  {leaderboard[2].nickname}
                </span>
              </div>
              <div className="w-full bg-white/10 h-32 rounded-t-3xl flex flex-col items-center justify-center text-4xl font-black border-x-4 border-t-4 border-white/10">
                3
                <span className="text-xs font-bold opacity-40 mt-1">
                  {leaderboard[2].score} pts
                </span>
              </div>
            </motion.div>
          )}
        </div>

        <button
          onClick={() => navigate("/games")}
          className="mt-20 px-16 py-5 bg-white text-[#46178f] rounded-2xl font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all"
        >
          Exit Game
        </button>
      </div>
    );
  }

  return null;
};
