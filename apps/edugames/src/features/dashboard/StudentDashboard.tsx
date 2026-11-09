import React, { useEffect, useState } from "react";
import {
  BookOpen,
  Clock,
  Target,
  PlayCircle,
  Award,
  Calendar,
  ChevronRight,
  User,
  Users,
  KeyRound,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { TeacherFollowUps } from "./TeacherFollowUps";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";



import { API_BASE_URL } from "../../shared/utils/apiConfig";
interface Course {
  id: number;
  code: string;
  name: string;
  batch: string;
  students: number;
  color?: string | null;
  teacher_name?: string | null;
  description?: string | null;
  enrollment_code?: string | null;
}

interface Lesson {
  id: number;
  course_id: number;
  title: string;
  topic: string;
  posted_at: string;
}

interface LessonDetail extends Lesson {
  syllabus_context?: string | null;
  lecture_flow?: string | null;
  examples?: string | null;
  activities?: string | null;
  quiz_questions?: string | null;
}

/** A deadline as the student reads it: "Wed 4 Mar, 5:30 PM", or just the date when no time was set. */
const formatDue = (deadline: { due_at: string | null; due_is_date_only?: boolean }): string => {
  if (!deadline.due_at) return "";
  const date = new Date(deadline.due_at);
  return deadline.due_is_date_only
    ? date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
    : date.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export const StudentDashboard: React.FC = () => {
  const { user: authUser } = useAuthStore();
  const [summary, setSummary] = useState<any>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [postedLessons, setPostedLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<LessonDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  // A failed load must say so; it must not look like "no assignments, no classes".
  const [loadError, setLoadError] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError("");
    try {
      // The server works out who you are from your login, so nothing about you is sent.
      const [lessonsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/lessons?status=posted`),
        fetch(`${API_BASE_URL}/api/dashboard/student-summary`),
      ]);
      if (!summaryRes.ok) {
        const body = await summaryRes.json().catch(() => ({}));
        throw new Error(body.detail || body.error?.message || "Could not load your dashboard.");
      }
      const summaryData = await summaryRes.json();
      const lessons = lessonsRes.ok ? await lessonsRes.json() : [];

      if (summaryData && Array.isArray(summaryData.courses)) {
        setEnrolledCourses(summaryData.courses);
      }
      if (Array.isArray(lessons)) {
        const sortedLessons = [...lessons].sort(
          (a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
        );
        setPostedLessons(sortedLessons.slice(0, 5));
      }
      setSummary(summaryData);
    } catch (error) {
      console.error(error);
      setLoadError(error instanceof Error ? error.message : "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    // Deadlines and results change while a student works, so refresh when the tab is shown again.
    const onVisible = () => { if (document.visibilityState === "visible") void quietRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const quietRefresh = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/student-summary`);
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data);
      if (Array.isArray(data.courses)) setEnrolledCourses(data.courses);
    } catch {
      /* keep what is on screen */
    }
  };

  const enrolledCourseIds = new Set(enrolledCourses.map((course) => course.id));
  const visibleLessons =
    enrolledCourseIds.size > 0
      ? postedLessons.filter((lesson) => enrolledCourseIds.has(lesson.course_id))
      : postedLessons;

  const courseNameById = (courseId: number) => {
    return (
      enrolledCourses.find((course) => course.id === courseId)?.name ||
      `Course ${courseId}`
    );
  };

  const openLesson = async (lessonId: number) => {
    setLessonLoading(true);
    setLessonError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/lessons/${lessonId}`);
      if (!response.ok) {
        throw new Error("Failed to load lesson");
      }
      const data = (await response.json()) as LessonDetail;
      setSelectedLesson(data);
    } catch (error) {
      setLessonError(error instanceof Error ? error.message : "Failed to load lesson");
    } finally {
      setLessonLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const studentName = authUser?.name || summary?.student?.name || "Student";
  // The average of graded work (marks earned over marks possible); nothing else is computed, so nothing else is shown.
  const average: number | null = summary?.student?.average ?? null;
  const pendingCount = summary?.student?.pendingAssignments || 0;
  const liveGamesCount = summary?.student?.liveGames || 0;

  if (loadError && !summary) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center" role="alert">
        <AlertCircle className="text-red-500" size={40} />
        <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Your dashboard could not be loaded</h2>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{loadError}</p>
        <button onClick={() => void loadDashboard()} className="btn btn-primary">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold font-display"
            style={{ color: "var(--color-text-primary)" }}
          >
            Welcome back, {studentName.split(" ")[0]}
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            You have {pendingCount} pending assignments and {liveGamesCount} live game session{liveGamesCount !== 1 ? 's' : ''}.
          </p>
        </div>
        <div
          className="hidden sm:flex gap-4 p-3 rounded-2xl border"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface-card)",
          }}
        >
          <div className="text-center" title="Marks earned over marks possible on graded work">
            <p
              className="text-xs uppercase font-bold"
              style={{ color: "var(--color-text-muted)" }}
            >
              Average Score
            </p>
            <p className="text-lg font-black" style={{ color: average == null ? "var(--color-text-muted)" : "var(--color-brand-blue)" }}>
              {average == null ? "Not recorded" : `${average}%`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Active Live Game CTA */}
          <Link
            to={summary?.liveGame?.active && summary?.liveGame?.session_id ? `/games/chain-answer/${summary.liveGame.session_id}` : "/games"}
            className="block rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
            aria-label={summary?.liveGame?.active ? `Join ${summary?.liveGame?.title || "the live game"}` : "Open EduGames"}
          >
          <GlassCard
            className="p-6 overflow-hidden relative cursor-pointer group"
            style={{ background: "linear-gradient(135deg, var(--color-brand-blue), var(--color-brand-blue-dark))" }}
          >
            <div className="absolute right-0 top-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-center sm:items-end gap-4">
              <div className="text-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-3 w-3 relative">
                    {summary?.liveGame?.active && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${summary?.liveGame?.active ? 'bg-red-500' : 'bg-slate-400'}`}></span>
                  </span>
                  <p className={`text-xs font-bold uppercase tracking-wider ${summary?.liveGame?.active ? 'text-red-300' : 'text-slate-300'}`}>
                    {summary?.liveGame?.active ? 'Live Session Active' : 'No Live Sessions'}
                  </p>
                </div>
                <h2 className="text-2xl font-black font-display mb-1">
                  {summary?.liveGame?.active 
                    ? (summary?.liveGame?.title || "Active Game Session")
                    : "No live session right now"}
                </h2>
                <p className="opacity-80 text-sm max-w-sm">
                  {summary?.liveGame?.active 
                    ? `Join ${summary?.liveGame?.teacher}'s live session.`
                    : "No live sessions are currently active. You can browse through available educational games or check your performance history."}
                </p>
              </div>
              <span
                className={`btn ${summary?.liveGame?.active ? 'bg-white text-blue-900' : 'bg-slate-700 text-slate-300'} border-none font-black px-6 hover:scale-105 active:scale-95 transition-transform flex gap-2 items-center w-full sm:w-auto mt-4 sm:mt-0`}
              >
                <PlayCircle size={18} /> {summary?.liveGame?.active ? 'Join Now' : 'View Games'}
              </span>
            </div>
          </GlassCard>
          </Link>

          {/* Posted Lessons */}
          {visibleLessons.length > 0 && (
            <div>
              <h3 className="section-title text-sm mb-3 flex items-center gap-2">
                <Lightbulb size={16} className="text-yellow-500" />
                New Lesson Plans from Your Teachers
              </h3>
              <div className="space-y-3">
                {visibleLessons.map((lesson) => (
                  <GlassCard
                    key={lesson.id}
                    className="p-4 hover:border-yellow-400/30 transition-colors cursor-pointer group"
                    onClick={() => openLesson(lesson.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Lightbulb size={14} className="text-yellow-500" />
                          <h4
                            className="font-bold text-sm"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {lesson.title || lesson.topic}
                          </h4>
                        </div>
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          Topic: {lesson.topic}
                        </p>
                        <p
                          className="text-xs mt-1"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {courseNameById(lesson.course_id)}
                        </p>
                        <p
                          className="text-[10px] mt-1"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          Posted{" "}
                          {new Date(lesson.posted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "var(--color-brand-blue)" }}
                      />
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {visibleLessons.length === 0 && (
            <GlassCard className="p-5">
              <h3 className="section-title text-sm mb-2 flex items-center gap-2">
                <Lightbulb size={16} className="text-yellow-500" />
                New Lesson Plans from Your Teachers
              </h3>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                No posted lessons are available yet.
              </p>
            </GlassCard>
          )}

          {/* Enrolled Courses */}
          <div>
            <h3 className="section-title text-sm mb-3">My Classrooms</h3>
            {enrolledCourses.length === 0 && (
              <p className="text-sm text-slate-500">
                You are not enrolled in any classrooms yet.
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {enrolledCourses.map((course: any) => (
                <GlassCard
                  key={course.id}
                  onClick={() => navigate("/classroom", { state: { courseId: course.id } })}
                  className="p-5 hover:border-blue-500/30 transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                      style={{ background: course.color || "#3b82f6" }}
                    >
                      <BookOpen size={20} />
                    </div>
                    <ChevronRight
                      size={18}
                      className="opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0"
                      style={{ color: "var(--color-brand-blue)" }}
                    />
                  </div>
                  <p className="text-[10px] font-bold text-blue-500 uppercase">
                    {course.code}
                  </p>
                  <h4
                    className="font-bold mb-1"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {course.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mb-3">
                    <User size={10} className="text-slate-400" />
                    <p className="text-xs font-semibold text-slate-500">
                      {course.teacher_name || "Unassigned"}
                    </p>
                  </div>

                  <div
                    className="pt-3 border-t flex justify-between items-center"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <p
                      className="text-xs font-semibold"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {course.students} Students &bull; Batch {course.batch}
                    </p>
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <TeacherFollowUps summary={summary} />
          {(summary?.comingUp || []).length > 0 && (
            <GlassCard className="p-5">
              <h3 className="section-title text-sm flex items-center gap-2 mb-3"><Clock size={16} className="text-emerald-500" /> Today &amp; Tomorrow</h3>
              <div className="space-y-2">
                {summary.comingUp.map((item: any, index: number) => (
                  <div key={`${item.title}-${index}`} className="rounded-lg border p-2.5" style={{ borderColor: "var(--color-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.title}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      {item.day === "today" ? "Today" : "Tomorrow"}{item.allDay ? "" : `, ${new Date(item.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}{item.location ? ` · ${item.location}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {(summary?.exams || []).length > 0 && (
            <GlassCard className="p-5">
              <h3 className="section-title text-sm flex items-center gap-2 mb-3"><Target size={16} className="text-blue-500" /> Exams You Can Take</h3>
              <div className="space-y-2">
                {summary.exams.map((exam: any) => (
                  <div key={exam.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 hover:bg-slate-50" style={{ borderColor: "var(--color-border)" }} role="link" tabIndex={0} onClick={() => navigate("/exams")} onKeyDown={(e) => { if (e.key === "Enter") navigate("/exams"); }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{exam.title}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{exam.courseCode} · {exam.timeLimit} min · {exam.inProgress ? "in progress" : `${exam.attemptsLeft} attempt${exam.attemptsLeft === 1 ? "" : "s"} left`}</p>
                    </div>
                    <ChevronRight size={14} className="shrink-0 text-slate-400" />
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-5">
            <h3 className="section-title text-sm flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-blue-500" /> Upcoming
              Deadlines
            </h3>
            <div className="space-y-3">
              {(summary?.overdue || []).map((deadline: any) => (
                <div
                  key={`late-${deadline.id}`}
                  className="flex border-l-2 pl-3 py-1 cursor-pointer hover:bg-slate-50 transition-colors rounded-r-md"
                  style={{ borderColor: "#ef4444" }}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate("/classroom", { state: { courseId: deadline.course_id, tab: "assignments" } })}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate("/classroom", { state: { courseId: deadline.course_id, tab: "assignments" } }); }}
                >
                  <div>
                    <h4 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{deadline.title}</h4>
                    <p className="text-xs font-semibold text-red-600">
                      Overdue &bull; {deadline.course_code} &bull; was due {formatDue(deadline)}
                    </p>
                  </div>
                </div>
              ))}
              {summary?.deadlines?.length > 0 ? (
                summary.deadlines.map((deadline: any) => (
                  <div
                    key={deadline.id}
                    className="flex border-l-2 pl-3 py-1 cursor-pointer hover:bg-slate-50 transition-colors rounded-r-md"
                    style={{ borderColor: deadline.is_urgent ? "#f59e0b" : "var(--color-brand-blue)" }}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate("/classroom", { state: { courseId: deadline.course_id, tab: "assignments" } })}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate("/classroom", { state: { courseId: deadline.course_id, tab: "assignments" } }); }}
                  >
                    <div>
                      <h4 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{deadline.title}</h4>
                      <p className="text-xs" style={{ color: deadline.is_urgent ? "#b45309" : "var(--color-text-secondary)" }}>
                        {deadline.course_code} &bull; {deadline.due_at ? `Due ${formatDue(deadline)}` : "No due date set"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                !(summary?.overdue || []).length && <p className="text-xs text-slate-500 italic">No upcoming deadlines.</p>
              )}
            </div>
          </GlassCard>


          <GlassCard className="p-5">
            <h3 className="section-title text-sm flex items-center gap-2 mb-3"><Award size={16} className="text-yellow-500" /> Recent Results</h3>
            {(summary?.recentResults || []).length === 0 ? (
              <p className="text-xs text-slate-500 italic">Your results will appear here after your first graded work, exam or game.</p>
            ) : (
              <div className="space-y-2">
                {summary.recentResults.map((result: any, index: number) => (
                  <div key={`${result.title}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" style={{ color: "var(--color-text-primary)" }}>{result.title}<span className="block text-[10px] text-slate-400">{result.type} · {new Date(result.at).toLocaleDateString()}</span></span>
                    <span className={`shrink-0 text-xs font-bold ${result.status === "flagged" ? "text-red-600" : ""}`} style={result.status === "flagged" ? undefined : { color: "var(--color-brand-blue)" }}>
                      {result.status === "flagged" ? "Flagged" : result.score == null ? result.status : `${result.score}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {(summary?.announcements || []).length > 0 && (
            <GlassCard className="p-5">
              <h3 className="section-title text-sm flex items-center gap-2 mb-3"><BookOpen size={16} className="text-blue-500" /> Announcements</h3>
              <div className="space-y-3">
                {summary.announcements.map((item: any) => (
                  <div key={item.id} className="cursor-pointer" role="link" tabIndex={0} onClick={() => navigate("/classroom", { state: { courseId: item.courseId, tab: "announcements" } })} onKeyDown={(e) => { if (e.key === "Enter") navigate("/classroom", { state: { courseId: item.courseId, tab: "announcements" } }); }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.pinned ? "Pinned: " : ""}{item.title}</p>
                    <p className="line-clamp-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>{item.body}</p>
                    <p className="text-[10px] text-slate-400">{item.courseCode} · {new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {selectedLesson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label={selectedLesson.title || selectedLesson.topic || "Lesson"}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedLesson(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setSelectedLesson(null); }}
        >
          <GlassCard className="w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-bold uppercase text-blue-500">
                  {courseNameById(selectedLesson.course_id)}
                </p>
                <h2
                  className="text-xl font-bold mt-1"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {selectedLesson.title || selectedLesson.topic}
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Posted {new Date(selectedLesson.posted_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedLesson(null)}
                className="btn btn-sm"
                autoFocus
              >
                Close
              </button>
            </div>

            <div className="space-y-5">
              {selectedLesson.lecture_flow && (
                <div>
                  <h4 className="font-bold text-sm mb-2">Lecture Flow</h4>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                    {selectedLesson.lecture_flow}
                  </p>
                </div>
              )}

              {selectedLesson.examples && (
                <div>
                  <h4 className="font-bold text-sm mb-2">Examples</h4>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                    {selectedLesson.examples}
                  </p>
                </div>
              )}

              {selectedLesson.activities && (
                <div>
                  <h4 className="font-bold text-sm mb-2">Activities</h4>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                    {selectedLesson.activities}
                  </p>
                </div>
              )}

            </div>
          </GlassCard>
        </div>
      )}

      {lessonLoading && (
        <div className="fixed bottom-4 right-4 z-50 rounded-full bg-white px-4 py-2 shadow-lg text-sm">
          Loading lesson...
        </div>
      )}

      {lessonError && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 shadow-lg">
          {lessonError}
        </div>
      )}
    </div>
  );
};
