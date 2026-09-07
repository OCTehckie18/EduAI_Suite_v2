import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Clock, Send, Download, Share2, Check, Upload, FileText } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

interface GeneratedLesson {
  lecture_flow: string;
  examples: string;
  activities: string;
  quiz_questions: string;
}

interface SavedLesson extends GeneratedLesson {
  id: number;
  title?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const AutoLessonPlannerComponent: React.FC<{ courseId?: number }> = ({
  courseId = 1,
}) => {
  const [topic, setTopic] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLesson, setGeneratedLesson] =
    useState<GeneratedLesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<
    Array<{ type: "user" | "ai"; content: string }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedLesson(null);
    setChatMessages([]);

    // Add user message to chat
    setChatMessages((prev) => [
      ...prev,
      {
        type: "user",
        content: `Generate lesson plan for: ${topic}${syllabus ? ` (Context: ${syllabus})` : ""}`,
      },
    ]);

    try {
      const response = await fetch(`${API_BASE_URL}/lessons/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: topic.trim(),
          syllabus_context: syllabus.trim() || null,
          course_id: courseId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate lesson: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to generate lesson");
      }

      setGeneratedLesson({
        lecture_flow: result.lecture_flow || "",
        examples: result.examples || "",
        activities: result.activities || "",
        quiz_questions: result.quiz_questions || "",
      });

      // Add AI response to chat
      setChatMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content:
            "Lesson plan generated successfully. Review the content below and click 'Post to Students' to share it with your class.",
        },
      ]);

      setPosted(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      setChatMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/lessons/parse-plan`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to parse course plan");
      }

      const result = await response.json();
      
      if (result.topic) setTopic(result.topic);
      if (result.syllabus_context) setSyllabus(result.syllabus_context);
      
      setChatMessages(prev => [
        ...prev,
        { 
          type: "ai", 
          content: `Course plan processed. ${result.topic ? `Detected topic: "${result.topic}"` : "Please confirm the topic below."}` 
        }
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setError(`Upload error: ${errorMessage}`);
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handlePostLesson = async () => {
    if (!generatedLesson) return;

    setIsPosting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/lessons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          course_id: courseId,
          title: topic,
          topic: topic,
          syllabus_context: syllabus || null,
          lecture_flow: generatedLesson.lecture_flow,
          examples: generatedLesson.examples,
          activities: generatedLesson.activities,
          quiz_questions: generatedLesson.quiz_questions,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save lesson: ${response.statusText}`);
      }

      const lesson = await response.json();

      // Now post it
      const postResponse = await fetch(
        `${API_BASE_URL}/lessons/${lesson.id}/post`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      if (!postResponse.ok) {
        throw new Error(`Failed to post lesson: ${postResponse.statusText}`);
      }

      setPosted(true);
      setChatMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content:
            "Lesson posted successfully. Your students can now see this in their dashboard.",
        },
      ]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to post lesson";
      setError(errorMessage);
      setChatMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content: `Error posting: ${errorMessage}`,
        },
      ]);
    } finally {
      setIsPosting(false);
    }
  };

  const handleDownloadLesson = () => {
    if (!generatedLesson || !topic) return;

    const content = `Lesson Plan: ${topic}

LECTURE FLOW:
${generatedLesson.lecture_flow}

EXAMPLES:
${generatedLesson.examples}

ACTIVITIES:
${generatedLesson.activities}

QUIZ QUESTIONS:
${generatedLesson.quiz_questions}`;

    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(content));
    element.setAttribute("download", `${topic.replace(/\s+/g, "_")}_lesson_plan.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-4">
      {/* Chat Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left - Input Panel */}
        <GlassCard className="p-6 lg:col-span-1 space-y-4">
          <h3
            className="font-bold text-sm"
            style={{ color: "var(--color-text-primary)" }}
          >
            Lesson Details
          </h3>

          <div className="space-y-3">
            {/* Course Plan Upload */}
            <div className="pb-3 border-b border-dashed border-slate-300/30 mb-2">
              <label 
                className="text-xs font-semibold mb-2 block"
                style={{ color: "var(--color-text-secondary)" }}
              >
                AI Auto-Fill from Course Plan
              </label>
              <div 
                className="relative group border border-dashed rounded-lg p-3 hover:border-blue-400/50 transition-all cursor-pointer"
                style={{ 
                  background: "rgba(255, 255, 255, 0.05)",
                  borderColor: "var(--color-border)"
                }}
                onClick={() => document.getElementById('course-plan-upload')?.click()}
              >
                <input 
                  id="course-plan-upload"
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileUpload}
                  disabled={isUploading || isGenerating}
                />
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isUploading ? 'bg-blue-100/20' : 'bg-slate-100/10'}`}>
                    {isUploading ? (
                      <Clock size={16} className="text-blue-500 animate-spin" />
                    ) : (
                      <Upload size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-[11px] font-bold" style={{ color: "var(--color-text-primary)" }}>
                      {isUploading ? "Reading document..." : "Upload Lesson Plan"}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                      PDF, Word, or Text
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label
                className="text-xs font-semibold mb-1.5 block"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Topic *
              </label>
              <input
                type="text"
                placeholder="e.g., Recursion in C++, Photosynthesis, World War II"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full p-2 rounded-lg text-sm"
                style={{
                  background: "var(--color-surface-base)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
                disabled={isGenerating}
              />
            </div>

            <div>
              <label
                className="text-xs font-semibold mb-1.5 block"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Syllabus Context (Optional)
              </label>
              <textarea
                placeholder="Add any syllabus details, learning objectives, or special requirements..."
                value={syllabus}
                onChange={(e) => setSyllabus(e.target.value)}
                className="w-full p-2 rounded-lg text-sm h-20 resize-none"
                style={{
                  background: "var(--color-surface-base)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
                disabled={isGenerating}
              />
            </div>

            {error && (
              <div className="p-2 rounded-lg bg-red-100/20 border border-red-300/30 text-xs text-red-600">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={
                !topic || isGenerating || (!generatedLesson === false && posted)
              }
              className="w-full btn btn-primary shadow flex items-center justify-center gap-2 text-sm"
            >
              {isGenerating ? (
                <>
                  <Clock size={14} className="animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Generate Lesson
                </>
              )}
            </button>

            {generatedLesson && !posted && (
              <button
                onClick={handlePostLesson}
                disabled={isPosting}
                className="w-full btn bg-green-600 hover:bg-green-700 text-white shadow flex items-center justify-center gap-2 text-sm"
              >
                {isPosting ? (
                  <>
                    <Clock size={14} className="animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Share2 size={14} />
                    Post to Students
                  </>
                )}
              </button>
            )}

            {posted && (
              <div className="w-full btn bg-green-100 text-green-700 border border-green-300 flex items-center justify-center gap-2 text-sm">
                <Check size={14} />
                Posted Successfully!
              </div>
            )}
          </div>
        </GlassCard>

        {/* Right - Chat & Output */}
        <div className="lg:col-span-2 space-y-4">
          {/* Chat Messages */}
          <GlassCard
            className="p-4 h-64 overflow-y-auto flex flex-col space-y-3"
            style={{ background: "var(--color-surface-base)" }}
          >
            {chatMessages.length === 0 ? (
              <div
                className="flex items-center justify-center h-full text-sm text-center"
                style={{ color: "var(--color-text-secondary)" }}
              >
                <p>
                  Chat history will appear here. Generate a lesson to begin!
                </p>
              </div>
            ) : (
              <>
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                        msg.type === "user"
                          ? "bg-blue-600 text-white rounded-br-none"
                          : "bg-slate-200/50 text-slate-700 rounded-bl-none"
                      }`}
                      style={
                        msg.type === "ai"
                          ? {
                              background: "var(--color-surface-card)",
                              color: "var(--color-text-primary)",
                            }
                          : {}
                      }
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </GlassCard>

          {/* Generated Content Preview - Full Display */}
          {generatedLesson && (
            <GlassCard className="p-4 space-y-4 max-h-full overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4
                  className="font-bold text-sm flex items-center gap-2"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <Check size={16} className="text-green-500" />
                  Generated Lesson Plan
                </h4>
                <button
                  onClick={handleDownloadLesson}
                  className="text-xs font-bold text-blue-600 hover:text-blue-500 flex items-center gap-1"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>

              <div className="space-y-4 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
                {generatedLesson.lecture_flow && (
                  <div>
                    <h5
                      className="text-xs font-bold mb-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Lecture Flow
                    </h5>
                    <p
                      className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {generatedLesson.lecture_flow}
                    </p>
                  </div>
                )}

                {generatedLesson.examples && (
                  <div>
                    <h5
                      className="text-xs font-bold mb-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Examples
                    </h5>
                    <p
                      className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {generatedLesson.examples}
                    </p>
                  </div>
                )}

                {generatedLesson.activities && (
                  <div>
                    <h5
                      className="text-xs font-bold mb-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Activities
                    </h5>
                    <p
                      className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {generatedLesson.activities}
                    </p>
                  </div>
                )}

                {generatedLesson.quiz_questions && (
                  <div>
                    <h5
                      className="text-xs font-bold mb-2"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Quiz Questions
                    </h5>
                    <p
                      className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {generatedLesson.quiz_questions}
                    </p>
                  </div>
                )}
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
};
