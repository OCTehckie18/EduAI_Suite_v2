import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BrainCircuit, Loader, RotateCcw, Send, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GlassCard } from "../../shared/components/GlassCard";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const prompts = [
  "Summarize the latest course activity",
  "Identify students who may need support",
  "Generate questions for my current lesson",
  "Draft an announcement for my class",
];

export const AIChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittedPromptRef = useRef("");

  const send = useCallback(
    async (value: string) => {
      const message = value.trim();
      if (!message || loading) return;
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
      };
      const history = messages.map((item) => ({
        role: item.role,
        content: item.content,
      }));
      setMessages((current) => [...current, userMessage]);
      setInput("");
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_ENDPOINTS.BASE}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message, history }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.detail || "AI service unavailable");
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", content: data.content },
        ]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              error instanceof Error ? error.message : "AI service unavailable",
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, messages],
  );

  const prompt = searchParams.get("prompt")?.trim() || "";

  useEffect(() => {
    if (!prompt) {
      submittedPromptRef.current = "";
      return;
    }
    if (submittedPromptRef.current === prompt) return;
    submittedPromptRef.current = prompt;
    setSearchParams({}, { replace: true });
    void send(prompt);
  }, [prompt, send, setSearchParams]);

  return (
    <div className="h-[calc(100vh-130px)] flex flex-col gap-5 animate-fade-in">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Ask Anything
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Your EduAI assistant for teaching, learning, and everyday questions.
        </p>
      </div>
      <GlassCard className="flex-1 flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl gradient-blue flex items-center justify-center shadow-lg">
                <BrainCircuit size={28} className="text-white" />
              </div>
              <h2
                className="text-lg font-bold"
                style={{ color: "var(--color-text-primary)" }}
              >
                What can I help with?
              </h2>
              <p
                className="max-w-md text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Ask a question, explore an idea, or get help preparing your next
                class.
              </p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className="w-8 h-8 rounded-full gradient-blue flex items-center justify-center shrink-0">
                {message.role === "user" ? (
                  <User size={14} className="text-white" />
                ) : (
                  <BrainCircuit size={14} className="text-white" />
                )}
              </div>
              <div
                className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${message.role === "assistant" ? "ai-markdown overflow-x-auto" : "whitespace-pre-wrap"}`}
                style={{
                  background:
                    message.role === "user"
                      ? "rgba(38,71,150,0.1)"
                      : "var(--color-surface-base)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {message.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              <Loader size={14} className="animate-spin" /> Thinking…
            </div>
          )}
        </div>
        <div
          className="border-t p-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex gap-2 overflow-x-auto mb-3">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  setInput(prompt);
                  inputRef.current?.focus();
                }}
                className="btn btn-ghost text-xs shrink-0 border"
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              className="form-input flex-1 resize-none"
              rows={2}
              placeholder="Ask a question…"
            />
            <button
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
            >
              <Send size={15} />
            </button>
            <button
              onClick={() => setMessages([])}
              disabled={loading}
              className="btn btn-ghost"
              title="Clear chat"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
