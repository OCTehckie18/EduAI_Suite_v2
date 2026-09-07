import React, { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Zap,
  Send,
  Gamepad2,
  Clock,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const getWsUrl = (path: string) => {
  const cleanUrl = API_BASE_URL.trim();
  if (cleanUrl.startsWith("/")) {
    const loc = window.location;
    const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1")
      ? `${loc.hostname}:8000`
      : loc.host;
    const pathPrefix = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") ? "" : cleanUrl;
    return `${protocol}//${wsHost}${pathPrefix}${path}`;
  } else {
    const absUrl = new URL(cleanUrl);
    const wsProtocol = absUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${absUrl.host}${absUrl.pathname === "/" ? "" : absUrl.pathname}${path}`;
  }
};

export const QuizController: React.FC = () => {
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<'join' | 'waiting' | 'playing' | 'submitted' | 'feedback' | 'finished'>('join');
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [score, setScore] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [avatar, setAvatar] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const lastResultRef = useRef<any>(null);
  const scoreRef = useRef<number>(0);

  const handleJoin = () => {
    if (!pin || !nickname) return;

    const ws = new WebSocket(getWsUrl(`/ws/quiz/${pin}?user_type=student&nickname=${nickname}`));
    socketRef.current = ws;

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Student WS Message:", message);

      if (message.type === "lobby_update") {
        const me = message.players.find((p: any) => p.nickname === nickname);
        if (me) setAvatar(me.avatar);
        setStatus('waiting');
      } else if (message.type === "new_question") {
        setCurrentQuestion(message.question);
        setStartTime(Date.now());
        setStatus('playing');
      } else if (message.type === "answer_submitted") {
        const result = { is_correct: message.is_correct, points: message.points };
        setLastResult(result);
        lastResultRef.current = result;
        setStatus('submitted');
      } else if (message.type === "show_results") {
        if (lastResultRef.current?.is_correct) {
          scoreRef.current += lastResultRef.current.points;
          setScore(scoreRef.current);
        }
        setStatus('feedback');
      } else if (message.type === "game_over") {
        setLeaderboard(message.leaderboard);
        const me = message.leaderboard.find((p: any) => p.nickname === nickname);
        if (me) {
          setScore(me.score);
          setRank(me.rank);
        }
        setStatus('finished');
      } else if (message.type === "error") {
        alert(message.message);
        setStatus('join');
      }
    };

    ws.onclose = () => setStatus('join');
  };

  const submitAnswer = (optionId: number) => {
    if (status !== 'playing') return;
    const responseTime = Date.now() - startTime;
    socketRef.current?.send(JSON.stringify({
      type: "submit_answer",
      question_id: currentQuestion.id,
      option_id: optionId,
      response_time: responseTime
    }));
  };

  if (status === 'join') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-6 text-white animate-fade-in relative overflow-hidden">
        <div className="w-full max-w-sm space-y-8 z-10">
          <div className="text-center">
            <motion.h1
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-6xl font-black italic tracking-tighter mb-2 shadow-text"
            >
              EduQuiz
            </motion.h1>
            <p className="text-purple-200 font-black uppercase tracking-widest text-sm">Join the Battle</p>
          </div>

          <div className="bg-white p-2 rounded-3xl shadow-2xl space-y-2">
            <input
              type="text"
              placeholder="Game PIN"
              className="w-full p-5 text-center text-3xl font-black text-gray-800 bg-gray-50 rounded-2xl border-none outline-none focus:ring-4 focus:ring-purple-200 transition-all placeholder:text-gray-300"
              value={pin}
              onChange={e => setPin(e.target.value)}
            />
            <input
              type="text"
              placeholder="Nickname"
              className="w-full p-5 text-center text-xl font-black text-gray-800 bg-gray-50 rounded-2xl border-none outline-none focus:ring-4 focus:ring-purple-200 transition-all placeholder:text-gray-300"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
            <button
              onClick={handleJoin}
              className="w-full p-6 bg-[#333] text-white rounded-2xl text-2xl font-black shadow-xl hover:bg-black active:scale-95 transition-all mt-4"
            >
              ENTER
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-6 text-white text-center animate-pulse">
        <span className="text-4xl mb-8 font-semibold tracking-wide">{avatar || "PLAYER"}</span>
        <h2 className="text-5xl font-black mb-4 italic tracking-tighter">You're in!</h2>
        <p className="text-2xl font-bold opacity-60">See your name on screen, {nickname}?</p>
      </div>
    );
  }

  if (status === 'playing' && currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-2 gap-2 animate-fade-in">
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2">
          {currentQuestion.options.map((opt: any, idx: number) => (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.9 }}
              onClick={() => submitAnswer(opt.id)}
              className="w-full h-full rounded-2xl flex items-center justify-center shadow-lg active:brightness-90 transition-all border-b-8 border-black/20"
              style={{ backgroundColor: opt.color || '#333' }}
            >
              <div className="w-20 h-20 border-8 border-white/30 rounded-2xl flex items-center justify-center">
                {idx === 0 && <div className="w-10 h-10 bg-white rotate-45" />}
                {idx === 1 && <div className="w-10 h-10 bg-white rounded-full" />}
                {idx === 2 && <div className="w-10 h-10 bg-white -rotate-45" />}
                {idx === 3 && <div className="w-10 h-10 bg-white" />}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  if (status === 'submitted') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-6 text-white text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="mb-8"
        >
          <Sparkles size={80} className="text-yellow-400" />
        </motion.div>
        <h2 className="text-4xl font-black italic mb-4">Answer Submitted!</h2>
        <p className="text-xl font-bold opacity-60">Waiting for others to finish...</p>
      </div>
    );
  }

  if (status === 'feedback' && lastResult) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`min-h-screen flex flex-col items-center justify-center p-8 text-white text-center ${lastResult.is_correct ? 'bg-green-500' : 'bg-red-500'
          }`}
      >
        {lastResult.is_correct ? (
          <>
            <CheckCircle2 size={120} className="mb-6 animate-bounce" />
            <h2 className="text-6xl font-black italic tracking-tighter mb-4 shadow-text">CORRECT</h2>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="bg-black/20 px-10 py-4 rounded-3xl font-black text-3xl shadow-xl"
            >
              +{lastResult.points} pts
            </motion.div>
          </>
        ) : (
          <>
            <XCircle size={120} className="mb-6 animate-shake" />
            <h2 className="text-6xl font-black italic tracking-tighter mb-4 shadow-text">INCORRECT</h2>
            <p className="text-2xl font-black opacity-80 italic">Don't give up, {nickname}!</p>
          </>
        )}

        <div className="mt-20 flex flex-col items-center gap-2">
          <span className="text-sm font-black uppercase tracking-widest opacity-60">Total Score</span>
          <span className="text-6xl font-black shadow-text">{score}</span>
        </div>
      </motion.div>
    );
  }

  if (status === 'finished') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col p-6 text-white animate-fade-in relative overflow-hidden">
        <div className="flex flex-col items-center text-center mt-8 mb-12">
          <Trophy size={80} className="text-yellow-400 mb-4 animate-bounce" />
          <h2 className="text-5xl font-black italic tracking-tighter mb-2 shadow-text">GAME OVER</h2>
          <div className="flex flex-col items-center gap-2">
            <span className="text-8xl font-black text-yellow-400">#{rank}</span>
            <span className="text-xl font-bold opacity-60">Final Score: {score} pts</span>
          </div>
        </div>

        <div className="flex-1 bg-white/10 backdrop-blur-md rounded-3xl p-6 overflow-y-auto custom-scrollbar border border-white/10">
          <h3 className="text-xl font-black uppercase tracking-widest mb-6 opacity-60 text-center">Leaderboard</h3>
          <div className="space-y-3">
            {leaderboard.map((p, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-4 rounded-2xl border ${p.nickname === nickname ? 'bg-yellow-400 text-[#46178f] border-yellow-500 scale-[1.02] shadow-xl' : 'bg-white/5 border-white/10'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`w-8 font-black ${p.nickname === nickname ? 'text-[#46178f]' : 'text-white/40'}`}>{idx + 1}</span>
                  <span className="text-2xl">{p.avatar}</span>
                  <span className="font-bold text-lg">{p.nickname}</span>
                </div>
                <span className="font-black">{p.score}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="mt-8 w-full p-6 bg-white text-[#46178f] rounded-2xl font-black text-2xl shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          DONE
        </button>
      </div>
    );
  }

  return null;
};
