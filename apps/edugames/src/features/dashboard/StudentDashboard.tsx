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
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";

const API_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}`;

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

export const StudentDashboard: React.FC = () => {
  const { user: authUser } = useAuthStore();
  const [summary, setSummary] = useState<any>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [discoverableCourses, setDiscoverableCourses] = useState<Course[]>([]);
  const [postedLessons, setPostedLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<LessonDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const storedUser = localStorage.getItem("user");
        const user = storedUser ? JSON.parse(storedUser) : { name: "Student" };
        const studentName = user.name;
        
        const [lessonsRes, summaryRes, discoverableRes] = await Promise.all([
          fetch(`${API_URL}/lessons?posted_only=true`),
          fetch(`${API_URL}/api/dashboard/student-summary?student_name=${encodeURIComponent(studentName)}`),
          fetch(`${API_URL}/api/dashboard/discoverable-classrooms`),
        ]);

        const lessons = await lessonsRes.json();
        const summaryData = await summaryRes.json();
        const discoverableData = await discoverableRes.json();

        if (summaryData && Array.isArray(summaryData.courses)) {
          setEnrolledCourses(summaryData.courses);
        }

        if (Array.isArray(discoverableData)) {
          setDiscoverableCourses(discoverableData);
        }

        if (Array.isArray(lessons)) {
          const sortedLessons = [...lessons].sort(
            (a, b) =>
              new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
          );
          setPostedLessons(sortedLessons.slice(0, 5));
        }

        setSummary(summaryData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const enrolledCourseIds = new Set(enrolledCourses.map((course) => course.id));
  const availableCourses = discoverableCourses.filter((course) => !enrolledCourseIds.has(course.id));
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
      const response = await fetch(`${API_URL}/lessons/${lessonId}`);
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
  const gpa = "TBD";
  const experiencePercentage = "TBD";
  const pendingCount = summary?.student?.pendingAssignments || 0;
  const liveGamesCount = summary?.student?.liveGames || 0;

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
          <div className="text-center" title="To be computed when exam data is provided">
            <p
              className="text-xs uppercase font-bold"
              style={{ color: "var(--color-text-muted)" }}
            >
              GPA Level
            </p>
            <p className="text-lg font-black text-slate-400">{gpa}</p>
          </div>
          <div className="w-px bg-slate-200" />
          <div className="text-center" title="Will be calculated as a percentage when results are available">
            <p
              className="text-xs uppercase font-bold"
              style={{ color: "var(--color-text-muted)" }}
            >
              Experience
            </p>
            <p className="text-lg font-black text-slate-400">{experiencePercentage}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Active Live Game CTA */}
          <GlassCard
            className="p-6 overflow-hidden relative cursor-pointer group"
            style={{ background: "linear-gradient(135deg, #1e3a8a, #312e81)" }}
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
                    : "Level Up Your Skills"}
                </h2>
                <p className="opacity-80 text-sm max-w-sm">
                  {summary?.liveGame?.active 
                    ? `Join ${summary?.liveGame?.teacher}'s live session. Earn XP and climb the leaderboard!`
                    : "No live sessions are currently active. You can browse through available educational games or check your performance history."}
                </p>
              </div>
              <Link
                to="/games"
                className={`btn ${summary?.liveGame?.active ? 'bg-white text-blue-900' : 'bg-slate-700 text-slate-300'} border-none font-black px-6 hover:scale-105 active:scale-95 transition-transform flex gap-2 items-center w-full sm:w-auto mt-4 sm:mt-0`}
              >
                <PlayCircle size={18} /> {summary?.liveGame?.active ? 'Join Now' : 'View Games'}
              </Link>
            </div>
          </GlassCard>

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

          {/* Discoverable Classrooms */}
          {availableCourses.length > 0 && (
            <div>
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <h3 className="section-title text-sm flex items-center gap-2">
                    <Users size={16} className="text-emerald-500" />
                    Active Classrooms You Can Join
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    Browse open classrooms and use the code to join the ones you want.
                  </p>
                </div>
                <Link to="/classroom" className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">
                  Open join flow <ChevronRight size={14} className="inline" />
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {availableCourses.map((course) => (
                  <GlassCard key={course.id} className="p-5 border-emerald-200/70 hover:border-emerald-400 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{course.code}</p>
                        <h4 className="font-bold mt-1" style={{ color: "var(--color-text-primary)" }}>{course.name}</h4>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">OPEN</span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      <p><User size={12} className="inline mr-1" />{course.teacher_name || "Teacher not listed"} <span className="mx-1">•</span> Batch {course.batch}</p>
                      <p><Users size={12} className="inline mr-1" />{course.students || 0} students enrolled</p>
                      {course.description && <p className="line-clamp-2 pt-1">{course.description}</p>}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Class code</p>
                        <p className="text-lg font-black tracking-[0.2em] text-slate-800">{course.enrollment_code}</p>
                      </div>
                      <Link to="/classroom" state={{ joinCode: course.enrollment_code }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                        Join <KeyRound size={13} />
                      </Link>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
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
                  key={course.code}
                  onClick={() => navigate("/classroom")}
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
          <GlassCard className="p-5">
            <h3 className="section-title text-sm flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-blue-500" /> Upcoming
              Deadlines
            </h3>
            <div className="space-y-3">
              {summary?.deadlines?.length > 0 ? (
                summary.deadlines.map((deadline: any) => (
                  <div
                    key={deadline.id}
                    className="flex border-l-2 pl-3 py-1 cursor-pointer hover:bg-slate-50 transition-colors rounded-r-md"
                    style={{ borderColor: deadline.is_urgent ? "#ef4444" : "var(--color-brand-blue)" }}
                    onClick={() => navigate("/classroom")}
                  >
                    <div>
                      <h4
                        className="text-sm font-bold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {deadline.title}
                      </h4>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {deadline.course_code} &bull; Due {deadline.due_date}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic">No upcoming deadlines.</p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-5 text-center bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200" title="Rankings will be available once exam data is computed">
            <Award size={40} className="mx-auto text-yellow-400 mb-2 opacity-60" />
            <h3 className="font-black text-yellow-800/60">Rankings TBD</h3>
            <p className="text-xs text-yellow-700/60 mt-1">
              Leaderboard ranking will be unlocked after the first exam results are published.
            </p>
          </GlassCard>
        </div>
      </div>

      {selectedLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
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

              {selectedLesson.quiz_questions && (
                <div>
                  <h4 className="font-bold text-sm mb-2">Quiz Questions</h4>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-secondary)" }}>
                    {selectedLesson.quiz_questions}
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
