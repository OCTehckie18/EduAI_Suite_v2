// EduGames - Live Presentation Session Interface
// Handles both Presenter Mode (student presenting) and Audience Mode (other students)
import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  MessageSquare,
  ThumbsUp,
  Send,
  X,
  Loader2,
  Play,
  Pause,
  Volume2,
  ArrowLeft,
  ArrowRight,
  Users,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Zap,
} from "lucide-react";
import PPTXViewer from "./PPTXViewer";
import { API_BASE_URL } from "../../shared/utils/gameAPI";

interface Poll {
  id: number;
  question: string;
  poll_type: string;
  is_active: boolean;
  options?: string[];
}

interface Question {
  id: number;
  question_text: string;
  is_anonymous: boolean;
  upvotes: number;
  is_answered: boolean;
  teacher_answer?: string;
  created_at: string;
}

interface SessionState {
  session_id: number;
  status: string;
  active_view: string;
  current_slide: number;
  user_type: string;
}

interface PreloadedInteraction {
  id: number;
  slide_number: number;
  interaction_type: string;
  config: { question: string; options?: string[] };
}

interface Props {
  sessionPin?: string;
  studentId?: number;
  isPresenter?: boolean;
  fileUrl?: string;
  submissionId?: number;
}

const LiveSessionInterface: React.FC<Props> = ({
  sessionPin: propsPin,
  studentId: propsStudentId,
  isPresenter: propsIsPresenter,
  fileUrl: propsFileUrl,
  submissionId: propsSubmissionId,
} = {}) => {
  const { pin } = useParams<{ pin: string }>();
  const [searchParams] = useSearchParams();

  const sessionPin = propsPin || pin || "";
  const studentId =
    propsStudentId ||
    parseInt(
      searchParams.get("studentId") ||
      localStorage.getItem("student_id") ||
      "1",
    );
  const isPresenter =
    propsIsPresenter || searchParams.get("isPresenter") === "true" || false;
  const fileUrl = propsFileUrl || searchParams.get("fileUrl") || "";

  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [currentPoll, setCurrentPoll] = useState<Poll | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showQnA, setShowQnA] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [upvotedQuestions, setUpvotedQuestions] = useState<Set<number>>(
    new Set(),
  );
  const [isMuted, setIsMuted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [preloadedInteractions, setPreloadedInteractions] = useState<PreloadedInteraction[]>([]);
  const [pendingInteraction, setPendingInteraction] = useState<PreloadedInteraction | null>(null);
  const [launchedInteractionIds, setLaunchedInteractionIds] = useState<Set<number>>(new Set());

  // Fetch predefined interactions for this submission
  useEffect(() => {
    if (propsSubmissionId && isPresenter) {
      fetch(`${API_BASE_URL}/slido/submissions/${propsSubmissionId}/interactions`)
        .then((r) => r.json())
        .then((data) => setPreloadedInteractions(Array.isArray(data) ? data : []))
        .catch(console.error);
    }
  }, [propsSubmissionId, isPresenter]);

  // Check for interactions when slide changes
  useEffect(() => {
    if (!isPresenter || preloadedInteractions.length === 0) return;
    const slide = sessionState?.current_slide || 1;
    const match = preloadedInteractions.find(
      (i) => i.slide_number === slide && !launchedInteractionIds.has(i.id)
    );
    setPendingInteraction(match || null);
  }, [sessionState?.current_slide, preloadedInteractions, launchedInteractionIds]);

  const launchInteraction = (interaction: PreloadedInteraction) => {
    sendWebSocketMessage("poll_launched", {
      question: interaction.config.question,
      poll_type: interaction.interaction_type.replace("poll_", ""),
      options: interaction.config.options || [],
      interaction_id: interaction.id,
    });
    setLaunchedInteractionIds((prev) => new Set([...prev, interaction.id]));
    setPendingInteraction(null);
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionPin]);

  const connectWebSocket = () => {
    const userType = isPresenter ? "presenter" : "student";

    const cleanUrl = API_BASE_URL.trim();
    let wsUrl = "";
    const path = `/ws/slido/${sessionPin}?user_type=${userType}&user_id=${studentId}`;
    if (cleanUrl.startsWith("/")) {
      const loc = window.location;
      const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1")
        ? `${loc.hostname}:8000`
        : loc.host;
      const pathPrefix = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") ? "" : cleanUrl;
      wsUrl = `${protocol}//${wsHost}${pathPrefix}${path}`;
    } else {
      const absUrl = new URL(cleanUrl);
      const wsProtocol = absUrl.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${wsProtocol}//${absUrl.host}${absUrl.pathname === "/" ? "" : absUrl.pathname}${path}`;
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  };

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case "session_state":
        setSessionState(message);
        break;
      case "poll_launched":
        setCurrentPoll(message.poll);
        setHasVoted(false);
        break;
      case "poll_results":
        // Handle poll closure and results
        setCurrentPoll(null);
        break;
      case "presentation_state_changed":
        setSessionState((prev) =>
          prev
            ? {
              ...prev,
              active_view: message.active_view,
              current_slide: message.current_slide,
            }
            : null,
        );
        break;
      case "qna_question_asked":
        setQuestions((prev) => [message.question, ...prev]);
        break;
      case "qna_upvote_updated":
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === message.question_id
              ? { ...q, upvotes: message.upvotes }
              : q,
          ),
        );
        break;
      case "qna_answered":
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === message.question_id
              ? { ...q, is_answered: true, teacher_answer: message.answer }
              : q,
          ),
        );
        break;
      case "session_ended":
        setSessionState((prev) => (prev ? { ...prev, status: "ended" } : null));
        break;
    }
  };

  const sendWebSocketMessage = (messageType: string, payload: any) => {
    if (wsRef.current && connected) {
      wsRef.current.send(
        JSON.stringify({
          type: messageType,
          ...payload,
        }),
      );
    }
  };

  const submitPollVote = (option: string) => {
    sendWebSocketMessage("poll_vote", {
      poll_id: currentPoll?.id,
      option_text: option,
    });
    setHasVoted(true);
  };

  const submitQuestion = () => {
    if (!newQuestion.trim()) return;

    sendWebSocketMessage("qna_question_asked", {
      question_text: newQuestion,
      is_anonymous: isAnonymous,
    });

    setNewQuestion("");
    setIsAnonymous(false);
  };

  const upvoteQuestion = (questionId: number) => {
    if (upvotedQuestions.has(questionId)) return;

    sendWebSocketMessage("qna_upvote", {
      question_id: questionId,
    });

    setUpvotedQuestions((prev) => new Set([...prev, questionId]));
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-white">
      {/* Presentation View - Left Side */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-slate-700 rounded transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">
              {isPresenter ? "Your Presentation" : `Watching Presentation`}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {isPresenter && (
              <>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-2 rounded transition ${isMuted ? "bg-red-600" : "hover:bg-slate-700"}`}
                >
                  <Volume2 className="w-5 h-5" />
                </button>
                <span className="text-sm text-slate-400">
                  Slide {sessionState?.current_slide || 1}
                </span>
              </>
            )}
            <Users className="w-5 h-5 text-slate-400" />
            <span className="text-sm">Live</span>
          </div>
        </div>

        {/* Presentation Container */}
        <div className="flex-1 bg-black flex items-center justify-center p-8 overflow-auto">
          <PPTXViewer
            fileUrl={fileUrl}
            fileName="presentation.pptx"
            title={isPresenter ? "Your Presentation" : "Watching Presentation"}
            onLoad={() => console.log("Presentation loaded")}
            onError={(error) => console.error("Viewer error:", error)}
          />
        </div>

        {/* Pending Interaction Banner */}
        {isPresenter && pendingInteraction && (
          <div
            className="border-t border-blue-500/30 px-4 py-3 flex items-center justify-between"
            style={{ background: "linear-gradient(135deg, rgba(38,71,150,0.15), rgba(52,96,196,0.10))" }}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-200">Interaction Ready</p>
                <p className="text-xs text-slate-400 truncate max-w-[250px]">
                  {pendingInteraction.config.question}
                </p>
              </div>
            </div>
            <button
              onClick={() => launchInteraction(pendingInteraction)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition"
              style={{ background: "linear-gradient(135deg, #264796, #3460c4)", boxShadow: "0 4px 12px rgba(38,71,150,0.4)" }}
            >
              <Zap className="w-4 h-4" /> Launch
            </button>
          </div>
        )}

        {/* Presenter Controls - Bottom */}
        {isPresenter && (
          <div className="bg-slate-800 border-t border-slate-700 p-4 flex items-center justify-center gap-6">
            <button
              onClick={() =>
                sendWebSocketMessage("presentation_state_changed", {
                  current_slide: (sessionState?.current_slide || 1) - 1,
                })
              }
              className="p-2 hover:bg-slate-700 rounded transition"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition">
              <Play className="w-5 h-5" />
              Live Controls
            </button>
            <button
              onClick={() =>
                sendWebSocketMessage("presentation_state_changed", {
                  current_slide: (sessionState?.current_slide || 1) + 1,
                })
              }
              className="p-2 hover:bg-slate-700 rounded transition"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>

      {/* Right Sidebar - Polls & Q&A */}
      <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden">
        {/* Active Poll */}
        {currentPoll && sessionState?.active_view === "poll" && (
          <div className="p-4 border-b border-slate-700 flex-shrink-0">
            <h3 className="font-semibold mb-3">{currentPoll.question}</h3>
            <div className="space-y-2">
              {currentPoll.poll_type === "multiple_choice" ? (
                ["Option A", "Option B", "Option C", "Option D"].map(
                  (opt, i) => (
                    <button
                      key={i}
                      onClick={() => submitPollVote(opt)}
                      disabled={hasVoted}
                      className={`w-full p-2 rounded transition text-left ${hasVoted
                          ? "bg-slate-700 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                      {opt}
                    </button>
                  ),
                )
              ) : currentPoll.poll_type === "rating" ? (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => submitPollVote(rating.toString())}
                      disabled={hasVoted}
                      className={`flex-1 p-2 rounded transition font-medium ${hasVoted
                          ? "bg-slate-700"
                          : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {hasVoted && (
              <p className="text-sm text-green-400 mt-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Vote submitted
              </p>
            )}
          </div>
        )}

        {/* Q&A Section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Q&A Header */}
          <div className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <h3 className="font-semibold">Q&A</h3>
              <span className="text-sm text-slate-400">
                ({questions.length})
              </span>
            </div>
            <button
              onClick={() => setShowQnA(!showQnA)}
              className="p-1 hover:bg-slate-700 rounded transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Questions List */}
          <div className="flex-1 overflow-y-auto space-y-2 p-3">
            {questions.map((q) => (
              <div key={q.id} className="bg-slate-700 p-3 rounded">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium flex-1">
                    {q.question_text}
                  </p>
                  <button
                    onClick={() => upvoteQuestion(q.id)}
                    disabled={upvotedQuestions.has(q.id)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition ${upvotedQuestions.has(q.id)
                        ? "bg-blue-600 text-white"
                        : "bg-slate-600 hover:bg-slate-500"
                      }`}
                  >
                    <ThumbsUp className="w-3 h-3" />
                    {q.upvotes}
                  </button>
                </div>

                {q.is_answered && (
                  <div className="bg-slate-600 p-2 rounded text-xs text-slate-200 mt-2 border-l-2 border-green-500">
                    <p className="font-medium text-green-400 mb-1">
                      Teacher's Answer:
                    </p>
                    <p>{q.teacher_answer}</p>
                  </div>
                )}

                {q.is_anonymous && (
                  <p className="text-xs text-slate-400 mt-1">Anonymous</p>
                )}
              </div>
            ))}
          </div>

          {/* Question Input */}
          <div className="p-3 border-t border-slate-700 flex-shrink-0">
            <div className="flex gap-2 mb-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded"
                />
                Anonymous
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && submitQuestion()}
                placeholder="Ask a question..."
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={submitQuestion}
                disabled={!newQuestion.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 p-2 rounded transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveSessionInterface;
