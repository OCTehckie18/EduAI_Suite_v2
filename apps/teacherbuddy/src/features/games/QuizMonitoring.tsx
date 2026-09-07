import React, { useState, useEffect, useRef } from "react";
import { 
  Users, 
  Play, 
  ChevronRight, 
  Trophy, 
  Clock, 
  QrCode,
  LayoutGrid,
  BarChart3,
  LogOut,
  Sparkles
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
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

interface Player {
  id: number;
  nickname: string;
  avatar: string;
}

export const QuizMonitoring: React.FC = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState<string | null>(null);
  const [status, setStatus] = useState<'lobby' | 'active' | 'result' | 'leaderboard' | 'completed'>('lobby');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [timer, setTimer] = useState(0);
  const [answerCount, setAnswerCount] = useState(0);
  const [stats, setStats] = useState<Record<number, number>>({});
  const [correctOptionIds, setCorrectOptionIds] = useState<number[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    startSession();
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const startSession = async () => {
    // If quizId is 6 digits, it's likely a PIN (rejoining)
    if (quizId && quizId.length === 6 && !isNaN(Number(quizId))) {
      try {
        const res = await fetch(`${API_BASE_URL}/quizzes/sessions/${quizId}`);
        if (res.ok) {
          const data = await res.json();
          setPin(quizId);
          setStatus(data.status);
          setQuestionIndex(data.current_question || 0);
          connectWebSocket(quizId);
          return;
        }
      } catch (err) {
        console.error("Failed to rejoin session", err);
      }
    }

    // Otherwise, create a new session
    try {
      const res = await fetch(`${API_BASE_URL}/quizzes/${quizId}/session`, { method: "POST" });
      const data = await res.json();
      setPin(data.pin);
      connectWebSocket(data.pin);
    } catch (err) {
      console.error("Failed to create session", err);
    }
  };

  const connectWebSocket = (pin: string) => {
    const ws = new WebSocket(getWsUrl(`/ws/quiz/${pin}?user_type=teacher`));
    socketRef.current = ws;

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case "lobby_update":
          setPlayers(message.players);
          break;
        case "new_question":
          setCurrentQuestion(message.question);
          setQuestionIndex(message.index);
          setTotalQuestions(message.total);
          setTimer(message.question.time_limit || 20);
          setAnswerCount(0);
          setStats({});
          setStatus('active');
          break;
        case "answer_count_update":
          setAnswerCount(message.count);
          break;
        case "show_results":
          setStats(message.stats);
          setCorrectOptionIds(message.correct_option_ids || []);
          setStatus('result');
          break;
        case "game_over":
          setLeaderboard(message.leaderboard);
          setStatus('completed');
          break;
      }
    };
  };

  useEffect(() => {
    if (status === 'active' && timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (timer === 0 && status === 'active') {
       socketRef.current?.send(JSON.stringify({ 
         type: "time_up", 
         question_id: currentQuestion.id 
       }));
    }
  }, [status, timer]);

  const handleStartGame = () => {
    socketRef.current?.send(JSON.stringify({ type: "start_game" }));
  };

  const handleNext = () => {
    if (status === 'result') {
       // Show leaderboard or next question
       socketRef.current?.send(JSON.stringify({ type: "next_question" }));
    } else {
       socketRef.current?.send(JSON.stringify({ type: "next_question" }));
    }
  };

  if (status === 'lobby') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-8 text-white overflow-hidden relative">
        {/* Background Sparkles */}
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
            
            <div className="flex items-center gap-8">
               <div className="bg-white/10 backdrop-blur-md px-8 py-4 rounded-2xl border border-white/20 flex items-center gap-4">
                  <Users size={32} />
                  <span className="text-4xl font-black">{players.length}</span>
               </div>
               <button 
                onClick={handleStartGame}
                disabled={players.length === 0}
                className="px-16 py-6 bg-white text-[#46178f] rounded-2xl text-3xl font-black shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
               >
                START
               </button>
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-6 max-h-[40vh] overflow-y-auto p-4 custom-scrollbar">
             <AnimatePresence>
               {players.map(p => (
                 <motion.div 
                   key={p.id}
                   initial={{ scale: 0, opacity: 0 }}
                   animate={{ scale: 1, opacity: 1 }}
                   exit={{ scale: 0, opacity: 0 }}
                   className="bg-white/10 backdrop-blur-sm border border-white/10 p-4 rounded-2xl text-center flex flex-col items-center gap-2"
                 >
                   <span className="text-4xl">{p.avatar}</span>
                   <span className="font-black truncate w-full">{p.nickname}</span>
                 </motion.div>
               ))}
             </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  if ((status === 'active' || status === 'result') && currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col animate-fade-in">
        <div className="bg-white border-b p-6 flex justify-between items-center shadow-sm z-10">
           <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg">
                 {questionIndex + 1}
              </div>
              <h2 className={`font-black text-gray-800 ${currentQuestion.image_url ? 'text-3xl' : 'text-5xl'}`}>
                {currentQuestion.text}
              </h2>
           </div>
           <div className="flex items-center gap-8">
              {status === 'active' && (
                <div className="flex flex-col items-center">
                   <span className="text-[10px] font-black uppercase text-gray-400">Answers</span>
                   <span className="text-4xl font-black text-purple-600">{answerCount}</span>
                </div>
              )}
              <div className={`w-24 h-24 rounded-full border-8 flex items-center justify-center text-4xl font-black transition-all ${
                timer < 5 && status === 'active' ? 'border-red-500 text-red-500 animate-pulse' : 'border-purple-600 text-purple-600'
              }`}>
                {status === 'active' ? timer : <Clock size={32} />}
              </div>
              <button 
                onClick={handleNext}
                className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-purple-700 transition-all flex items-center gap-2 text-xl"
              >
                {status === 'result' ? 'Next' : 'Skip'} <ChevronRight size={24} />
              </button>
           </div>
        </div>

        <div className="flex-1 p-12 flex flex-col items-center justify-center gap-12 overflow-hidden">
           {currentQuestion.image_url ? (
             <div className="w-full max-w-3xl aspect-video bg-white rounded-3xl shadow-2xl overflow-hidden border-8 border-white">
                <img src={currentQuestion.image_url} alt="Question" className="w-full h-full object-cover" />
             </div>
           ) : (
             <div className="h-20" /> // Spacer for text-only layout
           )}

           <div className={`grid grid-cols-2 gap-6 w-full max-w-7xl ${status === 'result' ? 'opacity-50 grayscale-[0.5]' : ''}`}>
              {currentQuestion.options.map((opt: any, idx: number) => {
                const count = stats[opt.id] || 0;
                const percentage = answerCount > 0 ? (count / answerCount) * 100 : 0;
                
                return (
                  <div 
                    key={idx}
                    className={`relative h-32 rounded-3xl shadow-xl flex items-center px-10 text-white text-3xl font-black gap-8 transition-all overflow-hidden ${
                      status === 'active' ? 'hover:scale-[1.02]' : ''
                    }`}
                    style={{ backgroundColor: opt.color || '#333' }}
                  >
                     <div className="w-12 h-12 border-4 border-white/40 rounded-xl flex items-center justify-center shrink-0">
                         {idx === 0 && <div className="w-6 h-6 bg-white rotate-45" />}
                         {idx === 1 && <div className="w-6 h-6 bg-white rounded-full" />}
                         {idx === 2 && <div className="w-6 h-6 bg-white -rotate-45" />}
                         {idx === 3 && <div className="w-6 h-6 bg-white" />}
                      </div>
                    <span className="flex-1 truncate">{opt.text}</span>
                    
                     {status === 'result' && (
                      <div className="absolute inset-y-0 right-0 w-32 bg-black/20 flex flex-col items-center justify-center">
                         <span className="text-4xl">{count}</span>
                         {correctOptionIds.includes(opt.id) && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-8 bg-green-500 rounded-r-lg" />}
                      </div>
                    )}
                  </div>
                );
              })}
           </div>
        </div>

        <div className="bg-white border-t p-4 flex justify-between items-center text-gray-400 font-black text-lg">
           <span>Question {questionIndex + 1} of {totalQuestions}</span>
           <div className="bg-[#46178f] text-white px-8 py-2 rounded-full font-black shadow-lg">PIN: {pin}</div>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-8 text-white animate-fade-in overflow-hidden relative">
        <Trophy size={120} className="text-yellow-400 mb-8 animate-bounce" />
        <h1 className="text-8xl font-black mb-16 italic tracking-tighter shadow-text">PODIUM</h1>
        
        <div className="flex items-end gap-6 max-w-5xl w-full h-[50vh]">
           {leaderboard[1] && (
             <motion.div 
               initial={{ y: 100, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.5 }}
               className="flex-1 flex flex-col items-center gap-4"
             >
                <div className="flex flex-col items-center">
                   <span className="text-6xl mb-2">{leaderboard[1].avatar}</span>
                   <span className="text-2xl font-black">{leaderboard[1].nickname}</span>
                </div>
                <div className="w-full bg-white/20 h-48 rounded-t-3xl flex flex-col items-center justify-center text-5xl font-black border-x-4 border-t-4 border-white/30">
                   2
                   <span className="text-sm font-bold opacity-60 mt-2">{leaderboard[1].score} pts</span>
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
                   <span className="text-8xl mb-4 animate-bounce">{leaderboard[0].avatar}</span>
                   <span className="text-4xl font-black text-yellow-400">{leaderboard[0].nickname}</span>
                </div>
                <div className="w-full bg-yellow-400 text-[#46178f] h-80 rounded-t-3xl flex flex-col items-center justify-center shadow-2xl">
                   <span className="text-9xl font-black">1</span>
                   <span className="text-xl font-black opacity-80">{leaderboard[0].score} pts</span>
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
                   <span className="text-5xl mb-2">{leaderboard[2].avatar}</span>
                   <span className="text-xl font-black">{leaderboard[2].nickname}</span>
                </div>
                <div className="w-full bg-white/10 h-32 rounded-t-3xl flex flex-col items-center justify-center text-4xl font-black border-x-4 border-t-4 border-white/10">
                   3
                   <span className="text-xs font-bold opacity-40 mt-1">{leaderboard[2].score} pts</span>
                </div>
             </motion.div>
           )}
        </div>

        <button 
          onClick={() => navigate('/games')}
          className="mt-20 px-16 py-5 bg-white text-[#46178f] rounded-2xl font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all"
        >
          Exit Game
        </button>
      </div>
    );
  }

  return null;
};
