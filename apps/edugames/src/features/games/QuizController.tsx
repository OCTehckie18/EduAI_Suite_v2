import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Sparkles,
  Clock,
  Flame,
} from "lucide-react";
import { motion } from "framer-motion";

import { buildWsUrl } from "../../shared/utils/apiConfig";
import { requestGameFullscreen } from "./fullscreen";
import { getCurrentAccessToken, getCurrentStudentName } from "../../shared/utils/currentStudent";
import { PlayerAvatar } from "../../shared/components/PlayerAvatar";
import { QuizAnswerInput } from "../../shared/components/QuizAnswerInput";

const SEAT_KEY = "eduquiz_seat";
const MAX_RECONNECTS = 5;

type Phase = "join" | "waiting" | "playing" | "submitted" | "feedback" | "finished";

interface Seat {
  pin: string;
  nickname: string;
  token: string;
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

const loadSeat = (): Seat | null => {
  try {
    const raw = sessionStorage.getItem(SEAT_KEY);
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
};
const saveSeat = (seat: Seat | null) => {
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* private mode: the seat just will not survive a refresh */
  }
};

export const QuizController: React.FC = () => {
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState(getCurrentStudentName());
  const [phase, setPhase] = useState<Phase>("join");
  const [problem, setProblem] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [me, setMe] = useState<ScoreRow | null>(null);
  const [board, setBoard] = useState<ScoreRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [avatar, setAvatar] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const seatRef = useRef<Seat | null>(null);
  const playerIdRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("join");
  const reconnects = useRef(0);
  const closedOnPurpose = useRef(false);

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const backToJoin = (message: string) => {
    closedOnPurpose.current = true;
    socketRef.current?.close();
    socketRef.current = null;
    saveSeat(null);
    seatRef.current = null;
    playerIdRef.current = null;
    setConnecting(false);
    setProblem(message);
    go("join");
  };

  const open = useCallback((targetPin: string, targetName: string, token: string) => {
    const access = getCurrentAccessToken();
    const params = new URLSearchParams({ user_type: "student", nickname: targetName });
    if (access) params.set("access_token", access); // lets the server save the result against the real account
    if (token) params.set("player_token", token);
    const ws = new WebSocket(buildWsUrl(`/ws/quiz/${encodeURIComponent(targetPin)}?${params.toString()}`));
    socketRef.current = ws;
    closedOnPurpose.current = false;

    ws.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "joined": {
          playerIdRef.current = message.player_id;
          const seat = { pin: targetPin, nickname: message.nickname, token: message.token };
          seatRef.current = seat;
          saveSeat(seat);
          setNickname(message.nickname);
          reconnects.current = 0;
          setConnecting(false);
          setProblem("");
          if (phaseRef.current === "join") go("waiting");
          break;
        }
        case "lobby_update": {
          const mine = message.players.find((p: any) => p.id === playerIdRef.current);
          if (mine) setAvatar(mine.avatar);
          break;
        }
        case "new_question":
          setCurrentQuestion(message.question);
          setDeadline(Date.now() + (message.question.time_left ?? message.question.time_limit ?? 20) * 1000);
          setChosen(null);
          setMe(null);
          setProblem("");
          go("playing");
          break;
        case "answer_submitted":
          go("submitted");
          break;
        case "show_results": {
          const rows: ScoreRow[] = message.scoreboard || [];
          setBoard(rows);
          setMe(rows.find((r) => r.id === playerIdRef.current) || null);
          go("feedback");
          break;
        }
        case "game_over": {
          const rows = message.leaderboard || [];
          setLeaderboard(rows);
          const mine = rows.find((p: any) => p.id === playerIdRef.current);
          setMe(mine ? ({ ...mine, gained: 0 } as ScoreRow) : null);
          saveSeat(null);
          closedOnPurpose.current = true;
          go("finished");
          break;
        }
        case "kicked":
          backToJoin(message.message || "The host removed you from the game.");
          break;
        case "error":
          if (message.code) {
            // The server is refusing this connection and says why.
            backToJoin(message.message);
          } else {
            setProblem(message.message || "Something went wrong.");
          }
          break;
      }
    };

    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      socketRef.current = null;
      if (closedOnPurpose.current || phaseRef.current === "finished" || phaseRef.current === "join") {
        setConnecting(false);
        return;
      }
      // The connection dropped mid-game: take the same seat back.
      const seat = seatRef.current;
      if (seat && reconnects.current < MAX_RECONNECTS) {
        reconnects.current += 1;
        setProblem("Connection lost. Reconnecting...");
        window.setTimeout(() => open(seat.pin, seat.nickname, seat.token), 1500);
        return;
      }
      backToJoin("Connection lost. Enter the PIN to rejoin.");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A refreshed page picks its seat back up instead of starting over.
  useEffect(() => {
    const seat = loadSeat();
    if (seat) {
      setPin(seat.pin);
      setNickname(seat.nickname);
      setConnecting(true);
      seatRef.current = seat;
      open(seat.pin, seat.nickname, seat.token);
    }
    return () => {
      closedOnPurpose.current = true;
      socketRef.current?.close();
    };
  }, [open]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const handleJoin = () => {
    const cleanPin = pin.trim();
    const cleanName = nickname.trim();
    if (!cleanPin) {
      setProblem("Enter the game PIN shown on the teacher's screen.");
      return;
    }
    if (!cleanName) {
      setProblem("Choose a nickname.");
      return;
    }
    setProblem("");
    setConnecting(true);
    requestGameFullscreen();
    open(cleanPin, cleanName, "");
  };

  const submitAnswer = (payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (phase !== "playing" || !currentQuestion || chosen !== null || !socket || socket.readyState !== WebSocket.OPEN) return;
    setChosen(1);
    // Only what was answered is sent; the server times and marks the answer itself.
    socket.send(JSON.stringify({ type: "submit_answer", question_id: currentQuestion.id, ...payload }));
  };

  if (phase === "join") {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-6 text-white animate-fade-in relative overflow-hidden">
        <div className="w-full max-w-sm space-y-8 z-10">
          <div className="text-center">
            <motion.h1 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl font-black italic tracking-tighter mb-2 shadow-text">
              EduQuiz
            </motion.h1>
            <p className="text-purple-200 font-black uppercase tracking-widest text-sm">Join the Battle</p>
          </div>

          <form
            className="bg-white p-2 rounded-3xl shadow-2xl space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleJoin();
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              aria-label="Game PIN"
              placeholder="Game PIN"
              className="w-full p-5 text-center text-3xl font-black text-gray-800 bg-gray-50 rounded-2xl border-none outline-none focus:ring-4 focus:ring-purple-200 transition-all placeholder:text-gray-300"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <input
              type="text"
              aria-label="Nickname"
              placeholder="Nickname"
              maxLength={30}
              className="w-full p-5 text-center text-xl font-black text-gray-800 bg-gray-50 rounded-2xl border-none outline-none focus:ring-4 focus:ring-purple-200 transition-all placeholder:text-gray-300"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            {problem && (
              <p role="alert" className="px-3 py-2 text-center text-sm font-bold text-red-600">
                {problem}
              </p>
            )}
            <button
              type="submit"
              disabled={connecting}
              className="w-full p-6 bg-[#333] text-white rounded-2xl text-2xl font-black shadow-xl hover:bg-black active:scale-95 transition-all mt-4 disabled:opacity-60"
            >
              {connecting ? "JOINING..." : "ENTER"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="mb-8 animate-pulse">
          <PlayerAvatar avatar={avatar} size={96} />
        </div>
        <h2 className="text-5xl font-black mb-4 italic tracking-tighter">You're in!</h2>
        <p className="text-2xl font-bold opacity-60">See your name on screen, {nickname}?</p>
        <p className="mt-6 text-sm font-bold opacity-50">Waiting for the host to start the game</p>
      </div>
    );
  }

  if (phase === "playing" && currentQuestion) {
    const total = Math.max(1, (currentQuestion.time_limit || 20) * 1000);
    const left = Math.max(0, deadline - now);
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-2 gap-2 animate-fade-in">
        <div className="h-3 rounded-full bg-gray-300 overflow-hidden" aria-label="Time left">
          <div className="h-full bg-purple-600 transition-[width] duration-200" style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
        </div>
        {problem && (
          <p role="alert" className="text-center text-sm font-bold text-red-600">
            {problem}
          </p>
        )}
        <QuizAnswerInput key={currentQuestion.id} question={currentQuestion} disabled={chosen !== null} onSubmit={submitAnswer} />
      </div>
    );
  }

  if (phase === "submitted") {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-6 text-white text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="mb-8">
          <Sparkles size={80} className="text-yellow-400" />
        </motion.div>
        <h2 className="text-4xl font-black italic mb-4">Answer Submitted!</h2>
        <p className="text-xl font-bold opacity-60">Waiting for others to finish...</p>
      </div>
    );
  }

  if (phase === "feedback") {
    const answered = !!me?.answered;
    const correct = !!me?.is_correct;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`min-h-screen flex flex-col items-center p-8 text-white text-center ${correct ? "bg-green-600" : "bg-red-600"}`}
      >
        <div className="flex flex-col items-center justify-center flex-1">
          {correct ? <CheckCircle2 size={110} className="mb-4 animate-bounce" /> : answered ? <XCircle size={110} className="mb-4" /> : <Clock size={110} className="mb-4" />}
          <h2 className="text-5xl font-black italic tracking-tighter mb-4">{correct ? "CORRECT" : answered ? "INCORRECT" : "OUT OF TIME"}</h2>
          {correct && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="bg-black/25 px-10 py-4 rounded-3xl font-black text-3xl shadow-xl">
              +{me?.gained} pts
            </motion.div>
          )}
          {correct && (me?.streak || 0) >= 2 && (
            <p className="mt-4 flex items-center gap-2 text-xl font-black">
              <Flame size={26} className="text-yellow-300" /> {me?.streak} in a row
            </p>
          )}
          {!correct && <p className="text-xl font-black opacity-80">Keep going, {nickname}!</p>}
        </div>

        <div className="w-full max-w-sm bg-black/20 rounded-3xl p-5 mb-6">
          <div className="flex justify-between items-end">
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-widest opacity-70">Your rank</p>
              <p className="text-5xl font-black">#{me?.rank ?? "-"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-widest opacity-70">Total score</p>
              <p className="text-5xl font-black">{me?.score ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm space-y-2">
          {board.slice(0, 5).map((row) => (
            <div key={row.id} className={`flex items-center justify-between rounded-2xl px-4 py-2 font-bold ${row.id === me?.id ? "bg-white text-gray-900" : "bg-white/15"}`}>
              <span className="flex items-center gap-3">
                <span className="w-6 text-center font-black opacity-70">{row.rank}</span>
                <PlayerAvatar avatar={row.avatar} size={28} />
                {row.nickname}
              </span>
              <span className="font-black">{row.score}</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (phase === "finished") {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col p-6 text-white animate-fade-in relative overflow-hidden">
        <div className="flex flex-col items-center text-center mt-8 mb-12">
          <Trophy size={80} className="text-yellow-400 mb-4 animate-bounce" />
          <h2 className="text-5xl font-black italic tracking-tighter mb-2 shadow-text">GAME OVER</h2>
          <div className="flex flex-col items-center gap-2">
            <span className="text-8xl font-black text-yellow-400">#{me?.rank ?? "-"}</span>
            <span className="text-xl font-bold opacity-60">Final Score: {me?.score ?? 0} pts</span>
            {typeof (me as any)?.correct === "number" && (
              <span className="text-xl font-bold opacity-80">
                {(me as any).correct} of {(me as any).total} correct{(me as any).percent !== null && ` (${(me as any).percent}%)`}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 bg-white/10 backdrop-blur-md rounded-3xl p-6 overflow-y-auto custom-scrollbar border border-white/10">
          <h3 className="text-xl font-black uppercase tracking-widest mb-6 opacity-60 text-center">Leaderboard</h3>
          <div className="space-y-3">
            {leaderboard.map((p, idx) => (
              <div
                key={p.id ?? idx}
                className={`flex items-center justify-between p-4 rounded-2xl border ${
                  p.id === me?.id ? "bg-yellow-400 text-[#46178f] border-yellow-500 scale-[1.02] shadow-xl" : "bg-white/5 border-white/10"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`w-8 font-black ${p.id === me?.id ? "text-[#46178f]" : "text-white/40"}`}>{idx + 1}</span>
                  <PlayerAvatar avatar={p.avatar} size={32} />
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
