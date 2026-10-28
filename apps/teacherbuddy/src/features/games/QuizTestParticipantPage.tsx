import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Trophy, XCircle } from "lucide-react";
import { buildWsUrl } from "../../shared/utils/apiConfig";

type ParticipantStatus = "connecting" | "waiting" | "playing" | "submitted" | "feedback" | "finished" | "error";

export const QuizTestParticipantPage: React.FC = () => {
  const { pin } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ParticipantStatus>("connecting");
  const [nickname, setNickname] = useState(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      return `Preview ${user.name || user.email || "Teacher"}`;
    } catch {
      return "Preview Teacher";
    }
  });
  const [question, setQuestion] = useState<any>(null);
  const [result, setResult] = useState<{ is_correct: boolean; points: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!pin) return;
    const token = localStorage.getItem("token");
    const ws = new WebSocket(buildWsUrl(
      `/ws/quiz/${encodeURIComponent(pin)}?user_type=teacher_player&nickname=${encodeURIComponent(nickname)}&access_token=${encodeURIComponent(token || "")}`,
    ));
    socketRef.current = ws;

    ws.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        setStatus("error");
        return;
      }
      if (message.type === "lobby_update") setStatus("waiting");
      if (message.type === "new_question") {
        setQuestion(message.question);
        setSelected(null);
        setStatus("playing");
      }
      if (message.type === "answer_submitted") {
        setResult({ is_correct: message.is_correct, points: message.points });
        setStatus("submitted");
      }
      if (message.type === "show_results") setStatus("feedback");
      if (message.type === "game_over") {
        setLeaderboard(message.leaderboard || []);
        setStatus("finished");
      }
      if (message.type === "error") setStatus("error");
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => {
      if (socketRef.current === ws && status !== "finished") setStatus("error");
    };
    return () => ws.close();
  }, [pin, nickname]);

  const submitAnswer = (optionId: number) => {
    const socket = socketRef.current;
    if (status !== "playing" || !socket || socket.readyState !== WebSocket.OPEN) return;
    setSelected(optionId);
    socket.send(JSON.stringify({ type: "submit_answer", question_id: question.id, option_id: optionId, response_time: 0 }));
  };

  if (status === "error") {
    return <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-5 p-6 text-center">
      <XCircle size={72} className="text-red-400" />
      <h1 className="text-3xl font-black">Test run unavailable</h1>
      <p className="text-slate-400">The session may have ended or your teacher session expired.</p>
      <button onClick={() => navigate("/games/quiz")} className="rounded-xl bg-white px-5 py-3 font-bold text-slate-900">Back to quizzes</button>
    </div>;
  }

  if (status === "waiting" || status === "connecting") {
    return <div className="min-h-screen bg-[#46178f] text-white flex flex-col items-center justify-center p-6 text-center">
      <span className="text-sm uppercase tracking-[0.3em] text-purple-200">Private teacher preview</span>
      <h1 className="mt-4 text-5xl font-black">You’re in!</h1>
      <p className="mt-4 text-xl text-purple-100">Waiting for the quiz owner to start the test run.</p>
      <p className="mt-8 rounded-full bg-white/10 px-5 py-2 font-bold">{nickname}</p>
    </div>;
  }

  if (status === "playing" && question) {
    return <div className="min-h-screen bg-slate-100 p-5 flex flex-col gap-6">
      <div className="rounded-3xl bg-white p-7 shadow-sm"><span className="text-xs font-black uppercase tracking-widest text-purple-600">Test run question</span><h1 className="mt-3 text-3xl font-black text-slate-900">{question.text}</h1></div>
      <div className="grid flex-1 grid-cols-2 gap-4">
        {question.options.map((option: any) => <button key={option.id} disabled={selected !== null} onClick={() => submitAnswer(option.id)} className="rounded-3xl p-5 text-xl font-black text-white shadow-lg disabled:opacity-70" style={{ backgroundColor: option.color || "#333" }}>{option.text}</button>)}
      </div>
    </div>;
  }

  if (status === "submitted") return <div className="min-h-screen bg-[#46178f] text-white flex flex-col items-center justify-center text-center"><CheckCircle2 size={96} className="text-emerald-300" /><h1 className="mt-6 text-4xl font-black">Answer submitted</h1><p className="mt-3 text-xl text-purple-100">Waiting for the quiz owner to show results.</p></div>;
  if (status === "feedback") return <div className="min-h-screen bg-emerald-600 text-white flex flex-col items-center justify-center text-center"><CheckCircle2 size={96} /><h1 className="mt-6 text-5xl font-black">{result?.is_correct ? "Correct" : "Answer reviewed"}</h1><p className="mt-4 text-2xl font-bold">+{result?.points || 0} points</p></div>;

  return <div className="min-h-screen bg-[#46178f] text-white p-8 text-center"><Trophy size={96} className="mx-auto text-yellow-300" /><h1 className="mt-5 text-5xl font-black">Test run complete</h1><div className="mx-auto mt-8 max-w-xl space-y-3">{leaderboard.map((player, index) => <div key={player.id || index} className="flex justify-between rounded-2xl bg-white/10 p-4 font-bold"><span>{index + 1}. {player.nickname}</span><span>{player.score}</span></div>)}</div><button onClick={() => navigate("/games/quiz")} className="mt-8 rounded-xl bg-white px-5 py-3 font-bold text-[#46178f]">Back to quizzes</button></div>;
};
