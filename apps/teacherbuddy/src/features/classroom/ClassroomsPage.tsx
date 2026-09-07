import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Clock,
  PlusCircle,
  FilePlus,
  UserPlus,
  Megaphone,
  Trash2,
  X,
  Paperclip,
  AlertCircle,
  Edit2,
  AlertTriangle,
  Download,
  User,
  Activity,
  TrendingUp,
  BarChart3,
  Gamepad2,
  FileCheck,
  ClipboardList,
  ChevronRight,
  Eye,
  Award,
  Target,
  BookOpen,
  Zap,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Timer,
  Sparkles,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

const API_URL = API_ENDPOINTS.BASE;

const DEPARTMENTS = [
  "Computer Science",
  "Statistics and Data Science",
  "Commerce",
  "English",
  "Law",
  "Business and Management",
];

export const ClassroomsPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState<any[]>([]);

  const [assignments, setAssignments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (courseId) {
      setSelectedId(parseInt(courseId));
    }
  }, [courseId]);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<
    "home" | "assignments" | "students" | "engagement"
  >("home");


  // Engagement State
  const [engagementData, setEngagementData] = useState<any>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentProfileData, setStudentProfileData] = useState<any>(null);
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<
    "overview" | "assignments" | "exams" | "games" | "timeline"
  >("overview");
  const [engagementSortKey, setEngagementSortKey] =
    useState<string>("engagement_score");
  const [engagementSortDir, setEngagementSortDir] = useState<"asc" | "desc">(
    "desc",
  );

  // Modals
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(
    null,
  );

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: string;
    id: number;
    message: string;
  } | null>(null);

  // Submissions State
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [viewingAssignmentId, setViewingAssignmentId] = useState<number | null>(
    null,
  );
  const [submissionsData, setSubmissionsData] = useState<any[]>([]);

  // Forms
  const [courseForm, setCourseForm] = useState({
    code: "",
    name: "",
    batch: `${new Date().getFullYear()}-A`,
    description: "",
    enrollment_code: "",
    color: "#264796",
    teacher_name: "",
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [coursePlanFile, setCoursePlanFile] = useState<File | null>(null);

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const [studentForm, setStudentForm] = useState({
    name: "",
    email: "",
    registration_number: "",
    student_class: "",
    department: DEPARTMENTS[0],
  });
  const [studentTab, setStudentTab] = useState<"manual" | "csv">("manual");
  const studentFileInputRef = useRef<HTMLInputElement>(null);

  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    time: "Just now",
    pinned: false,
  });
  const [announcementFile, setAnnouncementFile] = useState<File | null>(null);

  const [assignmentForm, setAssignmentForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    maxPoints: 100,
  });
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);

  const fetchCourses = async () => {
    try {
      const res = await fetch(`${API_URL}/courses/`, { headers: authHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        setClassrooms(data);
        if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      } else {
        setClassrooms([]);
      }
    } catch {
      setErrorMsg("Failed to connect to backend server.");
    }
  };

  const fetchCourseData = async () => {
    if (!selectedId) return;
    try {
      const [ann, stu, asgn] = await Promise.all([
        fetch(`${API_URL}/announcements/${selectedId}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`${API_URL}/students/${selectedId}`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(`${API_URL}/assignments/${selectedId}`, { headers: authHeaders() }).then((r) => r.json()),
      ]);
      const sortedAnnouncements = Array.isArray(ann)
        ? ann.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          // Fallback to id if created_at is missing for older announcements
          const timeA = a.created_at ? new Date(a.created_at).getTime() : a.id;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : b.id;
          return timeB - timeA;
        })
        : [];
      setAnnouncements(sortedAnnouncements);
      setStudents(Array.isArray(stu) ? stu : []);
      setAssignments(Array.isArray(asgn) ? asgn : []);
      fetchCourses(); // to update student counts
    } catch (e) {
      setErrorMsg("Error fetching dynamic active class data.");
    }
  };

  useEffect(() => {
    fetchCourses();
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      if (user.name) {
        setCourseForm((prev) => ({ ...prev, teacher_name: user.name }));
      }
    }
  }, []);
  useEffect(() => {
    if (selectedId) fetchCourseData();
  }, [selectedId]);

  // Engagement data fetching
  const fetchEngagement = async () => {
    if (!selectedId) return;
    setEngagementLoading(true);
    try {
      const res = await fetch(`${API_URL}/engagement/${selectedId}/summary`);
      const data = await res.json();
      setEngagementData(data);
    } catch {
      setErrorMsg("Failed to load engagement data.");
    } finally {
      setEngagementLoading(false);
    }
  };

  const fetchStudentProfile = async (studentId: number) => {
    setProfileLoading(true);
    setProfileTab("overview");
    try {
      const res = await fetch(`${API_URL}/engagement/student/${studentId}`);
      const data = await res.json();
      setStudentProfileData(data);
    } catch {
      setErrorMsg("Failed to load student profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const openStudentProfile = (student: any) => {
    setSelectedStudent(student);
    setShowStudentProfile(true);
    // Engagement-tab rows use student_id; students-tab rows use id
    fetchStudentProfile(student.student_id ?? student.id);
  };

  useEffect(() => {
    if (activeTab === "engagement" && selectedId) {
      fetchEngagement();
    }
  }, [activeTab, selectedId]);

  // Engagement helpers
  const getEngagementColor = (level: string) => {
    switch (level) {
      case "excellent":
        return {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
          dot: "bg-emerald-500",
        };
      case "good":
        return {
          bg: "bg-blue-50",
          text: "text-blue-700",
          border: "border-blue-200",
          dot: "bg-blue-500",
        };
      case "needs_attention":
        return {
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
          dot: "bg-amber-500",
        };
      case "at_risk":
        return {
          bg: "bg-red-50",
          text: "text-red-700",
          border: "border-red-200",
          dot: "bg-red-500",
        };
      default:
        return {
          bg: "bg-slate-50",
          text: "text-slate-600",
          border: "border-slate-200",
          dot: "bg-slate-400",
        };
    }
  };

  const getEngagementLabel = (level: string) => {
    switch (level) {
      case "excellent":
        return "Excellent";
      case "good":
        return "Good";
      case "needs_attention":
        return "Needs Attention";
      case "at_risk":
        return "At Risk";
      default:
        return "Unknown";
    }
  };

  const sortedEngagementStudents = engagementData?.students
    ? [...engagementData.students].sort((a: any, b: any) => {
      let aVal = a[engagementSortKey] ?? 0;
      let bVal = b[engagementSortKey] ?? 0;
      if (engagementSortKey === "assignments.completion_rate") {
        aVal = a.assignments?.completion_rate ?? 0;
        bVal = b.assignments?.completion_rate ?? 0;
      }
      if (engagementSortKey === "games.sessions_played") {
        aVal = a.games?.sessions_played ?? 0;
        bVal = b.games?.sessions_played ?? 0;
      }
      return engagementSortDir === "desc" ? bVal - aVal : aVal - bVal;
    })
    : [];

  const toggleSort = (key: string) => {
    if (engagementSortKey === key) {
      setEngagementSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setEngagementSortKey(key);
      setEngagementSortDir("desc");
    }
  };

  const handleApiCall = async (
    action: () => Promise<Response>,
    onSuccess: () => void,
  ) => {
    try {
      const res = await action();
      if (!res.ok) {
        // Only try to read body for non-204 error responses
        let errorDetail = `HTTP ${res.status}`;
        try {
          const text = await res.text();
          if (text) errorDetail = text;
        } catch { }
        throw new Error(errorDetail);
      }
      onSuccess();
      setErrorMsg(null);
    } catch (err: any) {
      console.error("API call failed:", err);
      setErrorMsg(
        "Something went wrong: " + err.message,
      );
    }
  };

  const resetCourseForm = () => {
    const storedUser = localStorage.getItem("user");
    const teacherName = storedUser ? JSON.parse(storedUser).name : "";
    setCourseForm({
      code: "",
      name: "",
      batch: "",
      description: "",
      enrollment_code: "",
      color: "#264796",
      teacher_name: teacherName,
    });
    setCoursePlanFile(null);
  };

  const handleCreateCourse = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    Object.entries(courseForm).forEach(([key, val]) =>
      formData.append(key, val),
    );
    if (coursePlanFile) formData.append("file", coursePlanFile);

    handleApiCall(
      () => fetch(`${API_URL}/courses/`, { method: "POST", headers: authHeaders(), body: formData }),
      () => {
        setShowCourseModal(false);
        resetCourseForm();
        fetchCourses();
      },
    );
  };

  const handleExtractDetails = async (file: File) => {
    setIsExtracting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/courses/extract_details`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Raw Extracted Data:", data);
        setCourseForm((prev) => ({
          ...prev,
          code: (data.code && data.code.trim()) || prev.code,
          name: (data.name && data.name.trim()) || prev.name,
          teacher_name:
            (data.teacher_name && data.teacher_name.trim()) ||
            prev.teacher_name,
          description:
            data.description || data.programmes
              ? `${data.description || data.programmes}`
              : prev.description,
        }));
      }
    } catch (err) {
      console.error("Extraction failed", err);
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    if (showCourseModal) {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.name) {
          setCourseForm((prev) => ({ ...prev, teacher_name: user.name }));
        }
      }
    }
  }, [showCourseModal]);

  const handleDeleteCourse = (id: number) => {
    setDeleteConfirm({
      type: "course",
      id,
      message:
        "Are you sure you want to delete this course? This action is irreversible.",
    });
  };

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("title", announcementForm.title);
    formData.append("body", announcementForm.body);
    formData.append("time", announcementForm.time);
    formData.append("pinned", String(announcementForm.pinned));
    if (announcementFile) formData.append("file", announcementFile);

    handleApiCall(
      () =>
        fetch(`${API_URL}/announcements/${selectedId}`, {
          method: "POST",
          body: formData,
        }),
      () => {
        setAnnouncementForm({
          title: "",
          body: "",
          time: "Just now",
          pinned: false,
        });
        setAnnouncementFile(null);
        setShowAnnouncementModal(false);
        fetchCourseData();
      },
    );
  };

  const handleDeleteAnnouncement = (id: number) => {
    setDeleteConfirm({
      type: "announcement",
      id,
      message: "Are you sure you want to delete this announcement?",
    });
  };

  const handleAddStudentManual = (e: React.FormEvent) => {
    e.preventDefault();
    handleApiCall(
      () =>
        fetch(`${API_URL}/students/${selectedId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(studentForm),
        }),
      () => {
        setStudentForm({
          name: "",
          email: "",
          registration_number: "",
          student_class: "",
          department: DEPARTMENTS[0],
        });
        setShowStudentModal(false);
        fetchCourseData();
      },
    );
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedId) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    handleApiCall(
      () =>
        fetch(`${API_URL}/students/bulk_upload/${selectedId}`, {
          method: "POST",
          body: formData,
        }),
      () => {
        setShowStudentModal(false);
        fetchCourseData();
      },
    );
  };

  const handleDeleteStudent = (id: number) => {
    setDeleteConfirm({
      type: "student",
      id,
      message: "Are you sure you want to remove this student from the course?",
    });
  };

  const handleOpenEditAssignment = (assignment: any) => {
    setEditingAssignmentId(assignment.id);
    setAssignmentForm({
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.due_date,
      maxPoints: assignment.max_points,
    });
    setAssignmentFile(null);
    setShowAssignmentModal(true);
  };

  const handleSaveAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;

    const formData = new FormData();
    formData.append("title", assignmentForm.title);
    formData.append("description", assignmentForm.description);
    formData.append("due_date", assignmentForm.dueDate);
    formData.append("max_points", assignmentForm.maxPoints.toString());
    if (assignmentFile) formData.append("file", assignmentFile);

    const method = editingAssignmentId ? "PUT" : "POST";
    const endpointUrl = editingAssignmentId
      ? `${API_URL}/assignments/${editingAssignmentId}`
      : `${API_URL}/assignments/${selectedId}`;

    handleApiCall(
      () => fetch(endpointUrl, { method, body: formData }),
      () => {
        setAssignmentForm({
          title: "",
          description: "",
          dueDate: "",
          maxPoints: 100,
        });
        setAssignmentFile(null);
        setEditingAssignmentId(null);
        setShowAssignmentModal(false);
        fetchCourseData();
      },
    );
  };

  const handleDeleteAssignment = (id: number) => {
    setDeleteConfirm({
      type: "assignment",
      id,
      message: "Are you sure you want to delete this assignment?",
    });
  };

  const handleViewSubmissions = async (assignment: any) => {
    setViewingAssignmentId(assignment.id);
    setSubmissionsData([]);
    setShowSubmissionsModal(true);
    try {
      const res = await fetch(`${API_URL}/submissions/${assignment.id}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setSubmissionsData(data);
      }
    } catch {
      setErrorMsg("Failed to fetch submissions.");
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;

    const { type, id } = deleteConfirm;
    const actionMap: Record<string, () => Promise<Response>> = {
      course: () => fetch(`${API_URL}/courses/${id}`, { method: "DELETE", headers: authHeaders() }),
      announcement: () =>
        fetch(`${API_URL}/announcements/${id}`, { method: "DELETE" }),
      student: () => fetch(`${API_URL}/students/${id}`, { method: "DELETE" }),
      assignment: () =>
        fetch(`${API_URL}/assignments/${id}`, { method: "DELETE" }),
    };

    handleApiCall(actionMap[type], () => {
      if (type === "course") {
        if (selectedId === id) setSelectedId(null);
        fetchCourses();
      } else {
        fetchCourseData();
      }
    });
    setDeleteConfirm(null);
  };

  const selected = classrooms.find((c) => c.id === selectedId);

  // Common Modal Input Style Class
  const premiumInput =
    "w-full bg-white border border-slate-300 rounded-xl px-4 py-3 mt-1 text-sm text-slate-800 focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue outline-none transition-all placeholder:text-slate-400 ";
  const premiumLabel =
    "text-xs font-bold uppercase tracking-wider text-slate-600 pl-1";
  const getDownloadUrl = (path?: string | null) => {
    if (!path) return "";
    const normalized = path.replace(/\\/g, "/");
    return normalized.startsWith("http")
      ? normalized
      : `${API_URL}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
  };

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-300 text-red-800 rounded-xl flex items-start gap-3 shadow-sm transition-all">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <p className="text-sm font-semibold">{errorMsg}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Classroom Management
          </h1>
          <button
            onClick={() => {
              setShowCourseModal(true);
            }}
            className="btn bg-brand-blue hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 btn-sm flex items-center gap-2 rounded-xl transition-all hover:-translate-y-0.5"
          >
            <PlusCircle size={18} /> Create New Class
          </button>
        </div>
        <input
          className="form-input w-72 rounded-xl border border-slate-300 shadow-sm bg-white text-slate-800 placeholder:text-slate-400"
          placeholder="Search classrooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* SIDEBAR */}
        <div className="space-y-3">
          {classrooms
            .filter(
              (c) =>
                c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.code.toLowerCase().includes(search.toLowerCase()) ||
                (c.teacher_name &&
                  c.teacher_name.toLowerCase().includes(search.toLowerCase())),
            )
            .map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/classrooms/${c.id}`)}
                className={`p-5 cursor-pointer relative group flex justify-between items-start transition-all duration-300 rounded-2xl border ${selectedId === c.id ? "ring-2 ring-brand-blue/40 border-brand-blue shadow-lg shadow-brand-blue/10 scale-105 z-10 bg-brand-blue-pale " : "border-slate-200 bg-white shadow-sm hover:shadow-md hover:scale-[1.02] hover:border-slate-300 "}`}
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-brand-gold-dark">
                    {c.code}
                  </p>
                  <p className="font-bold text-lg leading-tight text-slate-900 ">
                    {c.name}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="p-1 bg-slate-100 rounded text-slate-500">
                      <User size={12} />
                    </div>
                    <p className="text-xs font-semibold text-slate-600 truncate max-w-[150px]">
                      {c.teacher_name || "Unassigned"}
                    </p>
                  </div>
                  <p className="text-xs font-bold mt-2 text-brand-blue ">
                    {c.students} Enrolled
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteCourse(c.id);
                  }}
                  className="relative z-10 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 p-2 rounded-full transition-all cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
        </div>

        {/* MAIN PANE */}
        <div className="xl:col-span-3 space-y-4 relative">
          {!selected ? (
            <div className="p-16 text-center rounded-3xl border-dashed border-2 border-slate-300 bg-white/60 ">
              <p className="text-lg font-medium text-slate-500 ">
                No course selected or created.
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <div
                className="p-8 rounded-3xl relative overflow-hidden shadow-2xl"
                style={{
                  background: `linear-gradient(135deg, ${selected.color || "var(--color-brand-blue)"}, #1a202c)`,
                }}
              >
                <div className="relative z-10 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
                  <div className="text-white min-w-0">
                    <span className="text-xs font-bold tracking-widest uppercase text-white/50 mb-2 block">
                      Active Dashboard
                    </span>
                    <h2 className="text-4xl font-black tracking-tight mb-2">
                      {selected.name}
                    </h2>
                    <p className="text-white/80 text-base mb-4 leading-relaxed">
                      {selected.description}
                    </p>
                    <div className="flex flex-wrap gap-4 items-center">
                      {selected.teacher_name && (
                        <div className="flex items-center gap-2 mb-4 bg-white/10 w-fit px-4 py-1.5 rounded-full border border-white/20">
                          <User size={14} className="text-white/60" />
                          <span className="text-xs font-bold tracking-wide">
                            {selected.teacher_name}
                          </span>
                        </div>
                      )}
                      {/* REMOVED THE extra UI element */}

                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 shrink-0">
                    <button
                      onClick={() => {
                        setEditingAssignmentId(null);
                        setAssignmentForm({
                          title: "",
                          description: "",
                          dueDate: "",
                          maxPoints: 100,
                        });
                        setAssignmentFile(null);
                        setShowAssignmentModal(true);
                      }}
                      className="btn bg-white text-black border-none font-bold hover:bg-black hover:text-white shadow-xl px-5 py-2.5 rounded-xl transition-all hover:-translate-y-1"
                    >
                      <FilePlus size={18} className="mr-2 inline" /> Create
                      Assignment
                    </button>
                    <button
                      onClick={() => {
                        const code = selected.enrollment_code || "N/A";
                        navigator.clipboard.writeText(code).then(() => {
                          setCodeCopied(true);
                          setTimeout(() => setCodeCopied(false), 2000);
                        });
                      }}
                      className="btn bg-white/10 border border-white/20 text-white hover:bg-white/20 backdrop-blur-md font-semibold shadow-xl px-5 py-2.5 rounded-xl transition-all hover:-translate-y-1 flex items-center gap-2"
                    >
                      {codeCopied ? (
                        <>
                          <Check size={18} className="inline" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} className="inline" />
                          Code: {selected.enrollment_code || "N/A"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="absolute top-0 right-0 p-32 bg-white/5 rounded-full blur-[100px] -mr-10 -mt-10 pointer-events-none"></div>
              </div>

              <div className="flex justify-center gap-10 border-b border-slate-200 pb-0 mt-6 px-4">
                {["home", "assignments", "students", "engagement"].map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`text-sm tracking-wide font-bold capitalize pb-4 relative transition-all ${activeTab === tab ? "text-brand-blue " : "text-slate-600 hover:text-slate-900 "}`}
                    >
                      {tab}
                      {activeTab === tab && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-blue rounded-t-full" />
                      )}
                    </button>
                  ),
                )}
              </div>

              <div className="p-2 py-6">
                {activeTab === "home" && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest mb-3 text-slate-500 ">
                          Total Enrolled
                        </p>
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-brand-blue/10 rounded-xl">
                            <Users size={28} className="text-brand-blue " />
                          </div>
                          <p className="text-4xl font-extrabold text-slate-900 ">
                            {students.length}
                          </p>
                        </div>
                      </div>
                      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold uppercase tracking-widest mb-3 text-slate-500 ">
                          Course Progress
                        </p>
                        <div className="space-y-3 mt-1">
                          <div className="flex justify-between items-center">
                            <p className="text-2xl font-extrabold text-slate-900 ">
                              {selected.progress}%
                            </p>
                          </div>
                          <div className="progress-bar rounded-full h-3 bg-slate-200 ">
                            <div
                              className="progress-fill bg-brand-blue h-3 rounded-full shadow-lg shadow-blue-500/40"
                              style={{ width: `${selected.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-8 rounded-2xl bg-white border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-200 ">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg">
                            <Megaphone size={20} className="text-brand-blue" />
                          </div>
                          <h3 className="font-extrabold text-xl text-slate-900 ">
                            Class Announcements
                          </h3>
                        </div>
                        <button
                          onClick={() => {
                            setAnnouncementFile(null);
                            setShowAnnouncementModal(true);
                          }}
                          className="text-sm font-bold bg-brand-blue text-white px-4 py-2 rounded-lg hover:shadow-lg hover:shadow-blue-500/20 transition-all hover:-translate-y-0.5"
                        >
                          Post Announcement
                        </button>
                      </div>
                      <div className="grid gap-4 mt-2">
                        {announcements.length === 0 ? (
                          <div className="py-12 text-center">
                            <p className="text-slate-500 font-medium">
                              Clear skies. No announcements yet.
                            </p>
                          </div>
                        ) : (
                          announcements.map((a: any) => (
                            <div
                              key={a.id}
                              className="p-5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-start group shadow-sm transition-all hover:shadow-md hover:border-brand-blue/30"
                            >
                              <div>
                                <div className="flex items-center gap-3 mb-1">
                                  <p className="font-bold text-base text-slate-900 ">
                                    {a.title}
                                  </p>
                                  {a.pinned && (
                                    <span className="text-[10px] uppercase font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200">
                                      Pinned
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                                  {a.body}
                                </p>
                                {a.attachment_path && (
                                  <a
                                    href={getDownloadUrl(a.attachment_path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-blue hover:text-blue-700"
                                  >
                                    <Download size={14} />
                                    Show file
                                  </a>
                                )}
                                <p className="text-[10px] mt-3 font-bold text-slate-400 uppercase tracking-wider">
                                  {a.time}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteAnnouncement(a.id);
                                }}
                                className="relative z-10 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 p-2 rounded-lg transition-all cursor-pointer"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "assignments" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid gap-4">
                      {assignments.length === 0 ? (
                        <div className="p-16 text-center rounded-2xl bg-white/60 border border-slate-200 ">
                          <p className="text-slate-500 font-medium">
                            No assignments yet.
                          </p>
                        </div>
                      ) : (
                        assignments.map((a: any) => (
                          <div
                            key={a.id}
                            className="p-6 bg-white rounded-2xl border border-slate-200 flex justify-between items-start group shadow-sm hover:shadow-md transition-all hover:border-brand-blue/30"
                          >
                            <div className="flex-1">
                              <div className="flex justify-between items-center pr-6 mb-2">
                                <p className="font-bold text-brand-blue text-lg">
                                  {a.title}
                                </p>
                                <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                                  {a.max_points} Points Max
                                </span>
                              </div>
                              <p className="text-sm text-slate-700 mb-4 leading-relaxed">
                                {a.description}
                              </p>
                              <div className="flex items-center gap-6 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 p-3 rounded-lg inline-flex">
                                <div className="flex items-center gap-2">
                                  <Clock size={14} className="text-red-500" />
                                  <span>
                                    Due: {a.due_date.replace("T", " at ")}
                                  </span>
                                </div>
                                {a.media_path && (
                                  <a
                                    href={getDownloadUrl(a.media_path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-blue-700 hover:text-blue-800"
                                  >
                                    <Paperclip size={14} />
                                    <span>Show file</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleViewSubmissions(a);
                                  }}
                                  className="flex items-center gap-2 text-indigo-700 hover:text-indigo-800 font-bold ml-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm transition-all hover:bg-indigo-100"
                                >
                                  <Users size={14} /> View Submissions
                                </button>
                              </div>
                            </div>
                            <div className="relative z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleOpenEditAssignment(a);
                                }}
                                className="text-blue-500 hover:bg-blue-100 p-2 rounded-lg transition-all cursor-pointer"
                                title="Edit Assignment"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteAssignment(a.id);
                                }}
                                className="text-red-500 hover:bg-red-100 p-2 rounded-lg transition-all cursor-pointer"
                                title="Delete Assignment"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "students" && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {students.length === 0 ? (
                      <div className="text-center py-16 rounded-2xl bg-white/60 border border-slate-200 ">
                        <p className="text-slate-500 font-medium">
                          No students enrolled. Add some to begin mapping
                          grades.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {students.map((s: any) => (
                          <div
                            key={s.id}
                            onClick={() => openStudentProfile(s)}
                            className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between group shadow-sm hover:shadow-lg hover:border-brand-blue/40 transition-all cursor-pointer hover:scale-[1.01]"
                          >
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div
                                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-extrabold text-lg shadow-md"
                                  style={{
                                    background: "var(--color-brand-blue)",
                                  }}
                                >
                                  {s.name.charAt(0)}
                                </div>
                                <div
                                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${s.attendance > 60 ? "bg-emerald-500" : s.attendance > 30 ? "bg-amber-500" : "bg-red-500"}`}
                                  title={`Attendance: ${s.attendance}%`}
                                />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">
                                  {s.name}
                                </p>
                                <p className="text-xs font-bold text-slate-500 mt-1">
                                  {s.registration_number} • {s.department}
                                </p>
                                <p className="text-[10px] font-bold text-brand-blue">
                                  {s.email}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openStudentProfile(s);
                                }}
                                className="text-brand-blue hover:bg-blue-50 p-2 rounded-lg transition-all cursor-pointer"
                                title="View Profile"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteStudent(s.id);
                                }}
                                className="relative z-10 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-100 p-2 rounded-lg transition-all cursor-pointer"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "engagement" && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {engagementLoading ? (
                      <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-sm font-bold text-slate-500">
                          Analyzing student engagement...
                        </p>
                      </div>
                    ) : !engagementData ||
                      engagementData.total_students === 0 ? (
                      <div className="text-center py-16 rounded-2xl bg-white/60 border border-slate-200">
                        <Activity
                          size={48}
                          className="mx-auto mb-4 text-slate-300"
                        />
                        <p className="text-slate-500 font-medium">
                          No engagement data available. Enroll students and
                          create assignments to begin tracking.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Engagement Overview Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-2.5 bg-blue-50 rounded-xl">
                                <TrendingUp
                                  size={20}
                                  className="text-brand-blue"
                                />
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Avg Engagement
                              </p>
                            </div>
                            <p className="text-3xl font-extrabold text-slate-900">
                              {engagementData.class_avg_engagement}%
                            </p>
                          </div>
                          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-2.5 bg-emerald-50 rounded-xl">
                                <CheckCircle2
                                  size={20}
                                  className="text-emerald-600"
                                />
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Avg Attendance
                              </p>
                            </div>
                            <p className="text-3xl font-extrabold text-slate-900">
                              {engagementData.class_avg_attendance}%
                            </p>
                          </div>
                          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-2.5 bg-purple-50 rounded-xl">
                                <FileCheck
                                  size={20}
                                  className="text-purple-600"
                                />
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Assignment Rate
                              </p>
                            </div>
                            <p className="text-3xl font-extrabold text-slate-900">
                              {engagementData.class_avg_assignment_completion}%
                            </p>
                          </div>
                          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-2.5 bg-red-50 rounded-xl">
                                <AlertOctagon
                                  size={20}
                                  className="text-red-500"
                                />
                              </div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                At Risk
                              </p>
                            </div>
                            <p className="text-3xl font-extrabold text-red-600">
                              {engagementData.at_risk_count}
                            </p>
                            {engagementData.needs_attention_count > 0 && (
                              <p className="text-xs font-bold text-amber-600 mt-1">
                                +{engagementData.needs_attention_count} need
                                attention
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Student Engagement Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-50 rounded-lg">
                                <BarChart3
                                  size={20}
                                  className="text-brand-blue"
                                />
                              </div>
                              <h3 className="font-extrabold text-lg text-slate-900">
                                Student Engagement Rankings
                              </h3>
                            </div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              {engagementData.total_students} Students
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                  <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500">
                                    #
                                  </th>
                                  <th className="text-left px-5 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500">
                                    Student
                                  </th>
                                  <th
                                    className="text-center px-3 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500 cursor-pointer hover:text-brand-blue select-none"
                                    onClick={() =>
                                      toggleSort("engagement_score")
                                    }
                                  >
                                    Score{" "}
                                    {engagementSortKey === "engagement_score"
                                      ? engagementSortDir === "desc"
                                        ? "↓"
                                        : "↑"
                                      : ""}
                                  </th>
                                  <th
                                    className="text-center px-3 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500 cursor-pointer hover:text-brand-blue select-none"
                                    onClick={() => toggleSort("attendance")}
                                  >
                                    Attend.{" "}
                                    {engagementSortKey === "attendance"
                                      ? engagementSortDir === "desc"
                                        ? "↓"
                                        : "↑"
                                      : ""}
                                  </th>
                                  <th
                                    className="text-center px-3 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500 cursor-pointer hover:text-brand-blue select-none"
                                    onClick={() =>
                                      toggleSort("assignments.completion_rate")
                                    }
                                  >
                                    Assign.{" "}
                                    {engagementSortKey ===
                                      "assignments.completion_rate"
                                      ? engagementSortDir === "desc"
                                        ? "↓"
                                        : "↑"
                                      : ""}
                                  </th>
                                  <th
                                    className="text-center px-3 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500 cursor-pointer hover:text-brand-blue select-none"
                                    onClick={() =>
                                      toggleSort("games.sessions_played")
                                    }
                                  >
                                    Games{" "}
                                    {engagementSortKey ===
                                      "games.sessions_played"
                                      ? engagementSortDir === "desc"
                                        ? "↓"
                                        : "↑"
                                      : ""}
                                  </th>
                                  <th className="text-center px-3 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500">
                                    Status
                                  </th>
                                  <th className="text-center px-3 py-3 font-bold text-[10px] uppercase tracking-widest text-slate-500"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedEngagementStudents.map(
                                  (s: any, idx: number) => {
                                    const colors = getEngagementColor(
                                      s.engagement_level,
                                    );
                                    return (
                                      <tr
                                        key={s.student_id}
                                        className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors cursor-pointer"
                                        onClick={() => openStudentProfile(s)}
                                      >
                                        <td className="px-5 py-3.5 font-extrabold text-slate-400">
                                          {idx + 1}
                                        </td>
                                        <td className="px-5 py-3.5">
                                          <div className="flex items-center gap-3">
                                            <div className="relative">
                                              <div
                                                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                                                style={{
                                                  background:
                                                    "var(--color-brand-blue)",
                                                }}
                                              >
                                                {s.name.charAt(0)}
                                              </div>
                                              <div
                                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${colors.dot}`}
                                              />
                                            </div>
                                            <div>
                                              <p className="font-bold text-slate-900 text-sm">
                                                {s.name}
                                              </p>
                                              <p className="text-[10px] text-slate-500 font-semibold">
                                                {s.registration_number}
                                              </p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="text-center px-3 py-3.5">
                                          <span className="text-base font-extrabold text-slate-900">
                                            {s.engagement_score}
                                          </span>
                                        </td>
                                        <td className="text-center px-3 py-3.5 font-bold text-slate-700">
                                          {s.attendance}%
                                        </td>
                                        <td className="text-center px-3 py-3.5 font-bold text-slate-700">
                                          {s.assignments.completion_rate}%
                                        </td>
                                        <td className="text-center px-3 py-3.5 font-bold text-slate-700">
                                          {s.games.sessions_played}
                                        </td>
                                        <td className="text-center px-3 py-3.5">
                                          <span
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}
                                          >
                                            {getEngagementLabel(
                                              s.engagement_level,
                                            )}
                                          </span>
                                        </td>
                                        <td className="text-center px-3 py-3.5">
                                          <button
                                            className="text-brand-blue hover:bg-blue-50 p-1.5 rounded-lg transition-all"
                                            title="View Profile"
                                          >
                                            <ChevronRight size={16} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  },
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* At-Risk Alerts */}
                        {(engagementData.at_risk_count > 0 ||
                          engagementData.needs_attention_count > 0) && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="p-5 border-b border-slate-200 flex items-center gap-3">
                                <div className="p-2 bg-red-50 rounded-lg">
                                  <ShieldAlert
                                    size={20}
                                    className="text-red-500"
                                  />
                                </div>
                                <div>
                                  <h3 className="font-extrabold text-lg text-slate-900">
                                    Students Needing Attention
                                  </h3>
                                  <p className="text-xs text-slate-500 font-semibold">
                                    {engagementData.at_risk_count +
                                      engagementData.needs_attention_count}{" "}
                                    student(s) flagged
                                  </p>
                                </div>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {sortedEngagementStudents
                                  .filter(
                                    (s: any) =>
                                      s.engagement_level === "at_risk" ||
                                      s.engagement_level === "needs_attention",
                                  )
                                  .map((s: any) => {
                                    const colors = getEngagementColor(
                                      s.engagement_level,
                                    );
                                    return (
                                      <div
                                        key={s.student_id}
                                        className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer"
                                        onClick={() => openStudentProfile(s)}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="relative">
                                            <div
                                              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                                              style={{
                                                background:
                                                  s.engagement_level === "at_risk"
                                                    ? "#ef4444"
                                                    : "#f59e0b",
                                              }}
                                            >
                                              {s.name.charAt(0)}
                                            </div>
                                          </div>
                                          <div>
                                            <p className="font-bold text-slate-900 text-sm">
                                              {s.name}
                                            </p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                              <span className="text-[10px] font-bold text-slate-400">
                                                Attend: {s.attendance}%
                                              </span>
                                              <span className="text-[10px] font-bold text-slate-400">
                                                Assign:{" "}
                                                {s.assignments?.completion_rate ??
                                                  0}
                                                %
                                              </span>
                                              <span className="text-[10px] font-bold text-slate-400">
                                                Score: {s.engagement_score}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}
                                          >
                                            {getEngagementLabel(
                                              s.engagement_level,
                                            )}
                                          </span>
                                          <ChevronRight
                                            size={16}
                                            className="text-slate-400"
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- SUPER PREMIUM MODALS --- */}

      {showCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white [#111] border border-slate-200 rounded-3xl p-8 w-full max-w-lg shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] [0_20px_60px_-15px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-2xl text-slate-800 ">
                Create New Class
              </h3>
              <button
                className="text-slate-400 hover:text-slate-800 bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => {
                  setShowCourseModal(false);
                  resetCourseForm();
                }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateCourse} className="space-y-5">
              <div>
                <label className={premiumLabel}>Course Code</label>
                <input
                  required
                  className={premiumInput}
                  placeholder="e.g., CSC101"
                  value={courseForm.code}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, code: e.target.value })
                  }
                />
              </div>
              <div>
                <label className={premiumLabel}>Course Name</label>
                <input
                  required
                  className={premiumInput}
                  placeholder="e.g., Advance Algorithms"
                  value={courseForm.name}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={premiumLabel}>Batch</label>
                  <input
                    className={premiumInput}
                    placeholder="2026-A"
                    value={courseForm.batch}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, batch: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={premiumLabel}>Join Code</label>
                  <input
                    className={`${premiumInput} bg-slate-50 cursor-not-allowed`}
                    disabled
                    placeholder="Auto-generated"
                    value={courseForm.enrollment_code}
                  />
                </div>
              </div>
              <div>
                <label className={premiumLabel}>Description</label>
                <textarea
                  className={premiumInput}
                  placeholder="Brief summary of syllabus..."
                  rows={3}
                  value={courseForm.description}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className={premiumLabel}>Teacher Name</label>
                <input
                  required
                  className={premiumInput}
                  placeholder="e.g., Prof. Smith"
                  value={courseForm.teacher_name}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      teacher_name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center mt-2 hover:bg-slate-50 transition-colors relative">
                {isExtracting && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                    <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="text-xs font-bold text-brand-blue">
                      Extracting details...
                    </p>
                  </div>
                )}
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">
                  AI Detail Extraction (PDF/DOCX)
                </p>
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null;
                    setCoursePlanFile(file);
                    if (file) handleExtractDetails(file);
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-brand-blue/10 file:text-brand-blue hover:file:bg-brand-blue/20 cursor-pointer mx-auto"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-brand-blue hover:bg-blue-700 text-white shadow-lg shadow-brand-blue/30 py-4 rounded-xl font-bold text-lg transition-all hover:-translate-y-1"
              >
                Initialize Course
              </button>
            </form>
          </div>
        </div>
      )}

      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white [#111] border border-slate-200 rounded-3xl p-8 w-full max-w-lg shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] [0_20px_60px_-15px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-2xl text-slate-800 ">
                Enroll Students
              </h3>
              <button
                className="text-slate-400 hover:text-slate-800 bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => setShowStudentModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 mb-6 rounded-xl">
              <button
                onClick={() => setStudentTab("manual")}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${studentTab === "manual" ? "bg-white text-brand-blue shadow-sm" : "text-slate-500"}`}
              >
                Manual Entry
              </button>
              <button
                onClick={() => setStudentTab("csv")}
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${studentTab === "csv" ? "bg-white text-brand-blue shadow-sm" : "text-slate-500"}`}
              >
                Bulk Upload
              </button>
            </div>

            {studentTab === "manual" ? (
              <form onSubmit={handleAddStudentManual} className="space-y-4">
                <div>
                  <label className={premiumLabel}>Full Name</label>
                  <input
                    required
                    className={premiumInput}
                    placeholder="John Doe"
                    value={studentForm.name}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={premiumLabel}>Email Address</label>
                  <input
                    required
                    type="email"
                    className={premiumInput}
                    placeholder="student@university.edu"
                    value={studentForm.email}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, email: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={premiumLabel}>Reg Number</label>
                    <input
                      required
                      className={premiumInput}
                      placeholder="ID908"
                      value={studentForm.registration_number}
                      onChange={(e) =>
                        setStudentForm({
                          ...studentForm,
                          registration_number: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className={premiumLabel}>Class</label>
                    <input
                      required
                      className={premiumInput}
                      placeholder="Section A"
                      value={studentForm.student_class}
                      onChange={(e) =>
                        setStudentForm({
                          ...studentForm,
                          student_class: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className={premiumLabel}>Department</label>
                  <select
                    className={`${premiumInput} appearance-none cursor-pointer`}
                    value={studentForm.department}
                    onChange={(e) =>
                      setStudentForm({
                        ...studentForm,
                        department: e.target.value,
                      })
                    }
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full bg-brand-blue hover:bg-blue-700 text-white shadow-lg shadow-brand-blue/30 py-4 mt-2 rounded-xl font-bold text-lg transition-all hover:-translate-y-1"
                >
                  Add Student
                </button>
              </form>
            ) : (
              <div className="space-y-6 py-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 ">
                  <p className="text-sm font-semibold text-brand-blue mb-1">
                    Supported Formats: CSV, XLSX, TXT
                  </p>
                  <code className="text-xs font-bold text-slate-600 block mt-1">
                    Please ensure the file contains: Registration Number, Name, Email, Class, and Department. Our engine will automatically extract the details!
                  </code>
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:bg-slate-50 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.txt"
                    ref={studentFileInputRef}
                    onChange={handleBulkUpload}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-6 file:rounded-xl file:border-0 file:font-extrabold file:bg-brand-blue file:text-white hover:file:bg-blue-700 cursor-pointer shadow-lg shadow-blue-500/20"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showAnnouncementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white [#111] border border-slate-200 rounded-3xl p-8 w-full max-w-lg shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] [0_20px_60px_-15px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-2xl text-slate-800 ">
                Broadcast Message
              </h3>
              <button
                className="text-slate-400 hover:text-slate-800 bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => {
                  setShowAnnouncementModal(false);
                  setAnnouncementFile(null);
                }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateAnnouncement} className="space-y-5">
              <div>
                <label className={premiumLabel}>Headline / Title</label>
                <input
                  required
                  className={premiumInput}
                  placeholder="Urgent update..."
                  value={announcementForm.title}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      title: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className={premiumLabel}>Announcement Body</label>
                <textarea
                  required
                  className={premiumInput}
                  placeholder="Type your message explicitly here..."
                  rows={4}
                  value={announcementForm.body}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      body: e.target.value,
                    })
                  }
                />
              </div>
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center mt-2 hover:bg-slate-50 transition-colors">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">
                  Attachment Payload (Optional)
                </p>
                <input
                  type="file"
                  accept=".pdf,.pptx,.docx"
                  onChange={(e) =>
                    setAnnouncementFile(
                      e.target.files ? e.target.files[0] : null,
                    )
                  }
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-brand-blue/10 file:text-brand-blue hover:file:bg-brand-blue/20 cursor-pointer mx-auto"
                />
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 ">
                <input
                  type="checkbox"
                  id="pinned"
                  checked={announcementForm.pinned}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      pinned: e.target.checked,
                    })
                  }
                  className="w-5 h-5 rounded border-slate-300 text-brand-blue focus:ring-brand-blue cursor-pointer"
                />
                <label
                  htmlFor="pinned"
                  className="font-bold text-sm cursor-pointer select-none text-slate-700 "
                >
                  Pin this to top of dashboard feed
                </label>
              </div>
              <button
                type="submit"
                className="w-full bg-brand-blue hover:bg-blue-700 text-white shadow-lg shadow-brand-blue/30 py-4 rounded-xl font-bold text-lg transition-all hover:-translate-y-1"
              >
                Distribute Now
              </button>
            </form>
          </div>
        </div>
      )}

      {showAssignmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white [#111] border border-slate-200 rounded-3xl p-8 w-full max-w-lg shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] [0_20px_60px_-15px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-2xl text-slate-800 ">
                {editingAssignmentId
                  ? "Modify Assignment"
                  : "New Assignment Details"}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-800 bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => {
                  setShowAssignmentModal(false);
                  setAssignmentFile(null);
                }}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className={premiumLabel}>Designation Title</label>
                <input
                  required
                  className={premiumInput}
                  placeholder="Unit 2 Worksheet"
                  value={assignmentForm.title}
                  onChange={(e) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      title: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className={premiumLabel}>Instructions Payload</label>
                <textarea
                  required
                  className={premiumInput}
                  placeholder="Read chapter 4 strictly to conclude answers..."
                  rows={3}
                  value={assignmentForm.description}
                  onChange={(e) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      description: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={premiumLabel}>Strict Deadline</label>
                  <input
                    required
                    type="datetime-local"
                    className={`${premiumInput} text-slate-600 font-semibold`}
                    value={assignmentForm.dueDate}
                    onChange={(e) =>
                      setAssignmentForm({
                        ...assignmentForm,
                        dueDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className={premiumLabel}>Marks Grading</label>
                  <input
                    required
                    type="number"
                    min="0"
                    className={`${premiumInput} font-extrabold text-brand-blue`}
                    value={assignmentForm.maxPoints}
                    onChange={(e) =>
                      setAssignmentForm({
                        ...assignmentForm,
                        maxPoints: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center mt-2 hover:bg-slate-50 transition-colors">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">
                  {editingAssignmentId
                    ? "Update Attachment (Optional)"
                    : "Attachment Payload (Optional)"}
                </p>
                <input
                  type="file"
                  accept=".pdf,.pptx,.docx"
                  onChange={(e) =>
                    setAssignmentFile(e.target.files ? e.target.files[0] : null)
                  }
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-brand-blue/10 file:text-brand-blue hover:file:bg-brand-blue/20 cursor-pointer mx-auto"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gold text-slate-900 border-none font-bold py-4 rounded-xl hover:bg-yellow-400 shadow-xl shadow-yellow-500/20 text-lg transition-all hover:-translate-y-1 mt-2"
              >
                {editingAssignmentId
                  ? "Save Changes & Announce"
                  : "Activate Assignment Block"}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full max-w-sm shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="font-extrabold text-2xl text-slate-900 mb-2">
                Confirm Action
              </h3>
              <p className="text-slate-600 font-medium mb-8 leading-relaxed px-2">
                {deleteConfirm.message}
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3.5 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-all hover:-translate-y-0.5"
                >
                  Yes, Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubmissionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 w-full max-w-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-extrabold text-2xl text-slate-800 ">
                Student Submissions
              </h3>
              <button
                className="text-slate-400 hover:text-slate-800 bg-slate-100 p-2 rounded-full transition-colors"
                onClick={() => setShowSubmissionsModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {submissionsData.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-slate-50 border border-slate-200 ">
                  <p className="text-slate-500 font-medium">
                    No one has submitted work for this assignment yet.
                  </p>
                </div>
              ) : (
                submissionsData.map((sub: any) => (
                  <div
                    key={sub.id}
                    className="p-4 bg-white rounded-xl border border-slate-200 flex justify-between items-center shadow-sm"
                  >
                    <div>
                      <p className="font-bold text-slate-900 ">
                        {sub.student_name}
                      </p>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        Submitted at {sub.submitted_at}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {sub.file_path &&
                        sub.file_path
                          .split(",")
                          .map((path: string, idx: number) => (
                            <a
                              key={idx}
                              href={getDownloadUrl(path)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-100 transition-colors border border-blue-100"
                              title={path.split("/").pop()}
                            >
                              <Download size={14} />
                              {path
                                .split(/[\/\\]/)
                                .pop()
                                ?.replace(/^[^_]+_/, "") || `File ${idx + 1}`}
                            </a>
                          ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Student Profile Card Modal ── */}
      {showStudentProfile && (
        <div
          className="fixed inset-0 z-[60] flex justify-end bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowStudentProfile(false)}
        >
          <div
            className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-[0_0_80px_rgba(0,0,0,0.2)] animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {profileLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-sm font-bold text-slate-500">
                  Loading student profile...
                </p>
              </div>
            ) : !studentProfileData ? (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-slate-500 font-medium">No data available.</p>
              </div>
            ) : (
              <>
                {/* Profile Header */}
                <div className="relative overflow-hidden">
                  <div
                    className="p-8 pb-6"
                    style={{
                      background: "linear-gradient(135deg, #264796, #1a202c)",
                    }}
                  >
                    <button
                      onClick={() => setShowStudentProfile(false)}
                      className="absolute top-4 right-4 text-white/60 hover:text-white bg-white/10 p-2 rounded-full transition-colors"
                    >
                      <X size={20} />
                    </button>
                    <div className="flex items-center gap-5">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-2xl"
                        style={{
                          background:
                            "linear-gradient(135deg, #3460c4, #d0ae61)",
                        }}
                      >
                        {(studentProfileData.name ?? "?").charAt(0)}
                      </div>
                      <div className="text-white">
                        <h2 className="text-2xl font-black tracking-tight">
                          {studentProfileData.name}
                        </h2>
                        <p className="text-white/60 text-sm font-semibold mt-1">
                          {studentProfileData.registration_number} •{" "}
                          {studentProfileData.department}
                        </p>
                        <p className="text-white/40 text-xs font-bold mt-1">
                          {studentProfileData.email}
                        </p>
                      </div>
                    </div>

                    {/* Engagement Score Ring */}
                    <div className="mt-5 flex items-center gap-6">
                      <div className="relative w-16 h-16">
                        <svg
                          className="w-16 h-16 -rotate-90"
                          viewBox="0 0 64 64"
                        >
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="5"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            stroke={
                              studentProfileData.engagement_level ===
                                "excellent"
                                ? "#10b981"
                                : studentProfileData.engagement_level === "good"
                                  ? "#3b82f6"
                                  : studentProfileData.engagement_level ===
                                    "needs_attention"
                                    ? "#f59e0b"
                                    : "#ef4444"
                            }
                            strokeWidth="5"
                            strokeDasharray={`${(studentProfileData.engagement_score / 100) * 175.9} 175.9`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-white font-black text-lg">
                            {studentProfileData.engagement_score}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">
                          Engagement Score
                        </p>
                        {(() => {
                          const c = getEngagementColor(
                            studentProfileData.engagement_level,
                          );
                          return (
                            <span
                              className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${c.bg} ${c.text} border ${c.border}`}
                            >
                              {getEngagementLabel(
                                studentProfileData.engagement_level,
                              )}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="ml-auto flex gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-black text-white">
                            {studentProfileData.attendance}%
                          </p>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                            Attendance
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-black text-white">
                            {studentProfileData.assignments.completion_rate}%
                          </p>
                          <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                            Assign.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-[60px] pointer-events-none"></div>
                </div>

                {/* Profile Tabs */}
                <div className="flex border-b border-slate-200 px-6">
                  {(
                    [
                      "overview",
                      "assignments",
                      "exams",
                      "games",
                      "timeline",
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setProfileTab(tab)}
                      className={`py-3 px-4 text-xs font-bold uppercase tracking-wider transition-all relative ${profileTab === tab ? "text-brand-blue" : "text-slate-400 hover:text-slate-600"}`}
                    >
                      {tab}
                      {profileTab === tab && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue rounded-t-full" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="p-6 space-y-4">
                  {/* Overview Tab */}
                  {profileTab === "overview" && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen size={16} className="text-brand-blue" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Assignments
                            </p>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-900">
                            {studentProfileData.assignments.submitted}/
                            {studentProfileData.assignments.total}
                          </p>
                          <p className="text-xs text-slate-500 font-semibold mt-1">
                            Avg Grade:{" "}
                            {studentProfileData.assignments.avg_grade !== null
                              ? `${studentProfileData.assignments.avg_grade}`
                              : "N/A"}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2">
                            <ClipboardList
                              size={16}
                              className="text-purple-600"
                            />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Exams
                            </p>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-900">
                            {studentProfileData.exams.total_attempts}
                          </p>
                          <p className="text-xs text-slate-500 font-semibold mt-1">
                            Avg Score:{" "}
                            {studentProfileData.exams.avg_score !== null
                              ? `${studentProfileData.exams.avg_score}`
                              : "N/A"}
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Gamepad2 size={16} className="text-amber-600" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Games
                            </p>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-900">
                            {studentProfileData.games.sessions_played}
                          </p>
                          <p className="text-xs text-slate-500 font-semibold mt-1">
                            Score: {studentProfileData.games.total_score} pts
                          </p>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Target size={16} className="text-emerald-600" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              Words Valid
                            </p>
                          </div>
                          <p className="text-2xl font-extrabold text-slate-900">
                            {studentProfileData.games.total_words_valid}/
                            {studentProfileData.games.total_words_submitted}
                          </p>
                          <p className="text-xs text-slate-500 font-semibold mt-1">
                            Accuracy:{" "}
                            {studentProfileData.games.total_words_submitted > 0
                              ? `${((studentProfileData.games.total_words_valid / studentProfileData.games.total_words_submitted) * 100).toFixed(0)}%`
                              : "N/A"}
                          </p>
                        </div>
                      </div>

                      {/* Engagement Summary Card */}
                      {studentProfileData.engagement_summary && (
                        <div className="p-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 shadow-sm">
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="p-1.5 bg-gradient-to-br from-slate-600 to-blue-700 rounded-lg shadow-md shadow-slate-300/40">
                              <Activity size={14} className="text-white" />
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                              Engagement Summary
                            </p>
                          </div>
                          <p className="text-sm text-slate-700 leading-relaxed font-medium">
                            {studentProfileData.engagement_summary}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assignments Tab */}
                  {profileTab === "assignments" && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      {studentProfileData.assignments.details.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <BookOpen size={32} className="mx-auto mb-3" />
                          <p className="font-medium">
                            No assignments in this course.
                          </p>
                        </div>
                      ) : (
                        studentProfileData.assignments.details.map(
                          (a: any, i: number) => (
                            <div
                              key={i}
                              className={`p-4 rounded-xl border flex items-center justify-between ${a.status === "submitted" ? "bg-white border-slate-200" : "bg-red-50/50 border-red-200"}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div
                                  className={`p-2 rounded-lg ${a.status === "submitted" ? "bg-emerald-50 text-emerald-600" : "bg-red-100 text-red-500"}`}
                                >
                                  {a.status === "submitted" ? (
                                    <CheckCircle2 size={18} />
                                  ) : (
                                    <XCircle size={18} />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-slate-900 text-sm truncate">
                                    {a.assignment_title}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                    Due:{" "}
                                    {a.due_date?.replace("T", " at ") || "N/A"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-3">
                                {a.status === "submitted" ? (
                                  <>
                                    <p className="font-extrabold text-brand-blue text-sm">
                                      {a.grade !== null
                                        ? `${a.grade}/${a.max_points}`
                                        : "Pending"}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-semibold">
                                      {a.submitted_at || ""}
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                                    Missing
                                  </span>
                                )}
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  )}

                  {/* Exams Tab */}
                  {profileTab === "exams" && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      {studentProfileData.exams.details.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <ClipboardList size={32} className="mx-auto mb-3" />
                          <p className="font-medium">
                            No exam attempts recorded.
                          </p>
                        </div>
                      ) : (
                        studentProfileData.exams.details.map(
                          (e: any, i: number) => (
                            <div
                              key={i}
                              className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                                  <ClipboardList size={18} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm">
                                    {e.exam_title}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                    {e.start_time
                                      ? new Date(
                                        e.start_time,
                                      ).toLocaleDateString()
                                      : "N/A"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-extrabold text-purple-700 text-sm">
                                  {e.score !== null ? e.score : "N/A"}
                                </p>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${e.status === "submitted" ? "bg-green-50 text-green-600 border border-green-200" : "bg-amber-50 text-amber-600 border border-amber-200"}`}
                                >
                                  {e.status}
                                </span>
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  )}

                  {/* Games Tab */}
                  {profileTab === "games" && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      {studentProfileData.games.details.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <Gamepad2 size={32} className="mx-auto mb-3" />
                          <p className="font-medium">
                            No game sessions recorded.
                          </p>
                        </div>
                      ) : (
                        studentProfileData.games.details.map(
                          (g: any, i: number) => (
                            <div
                              key={i}
                              className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                  <Gamepad2 size={18} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900 text-sm">
                                    {g.game_name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                    Words: {g.words_valid}/{g.words_submitted}{" "}
                                    valid
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-extrabold text-amber-700 text-sm">
                                  {g.score} pts
                                </p>
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${g.game_status === "completed" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : g.game_status === "active" ? "bg-blue-50 text-blue-600 border border-blue-200" : "bg-slate-50 text-slate-500 border border-slate-200"}`}
                                >
                                  {g.game_status}
                                </span>
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  )}

                  {/* Timeline Tab */}
                  {profileTab === "timeline" && (
                    <div className="space-y-1 animate-in fade-in duration-300">
                      {studentProfileData.timeline.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                          <Activity size={32} className="mx-auto mb-3" />
                          <p className="font-medium">
                            No activity recorded yet.
                          </p>
                        </div>
                      ) : (
                        <div className="relative pl-6 border-l-2 border-slate-200 space-y-4">
                          {studentProfileData.timeline.map(
                            (t: any, i: number) => (
                              <div key={i} className="relative">
                                <div
                                  className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 border-white ${t.type === "assignment_submission" ? "bg-emerald-500" : t.type === "exam_attempt" ? "bg-purple-500" : "bg-amber-500"}`}
                                />
                                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 ml-2">
                                  <div className="flex items-center justify-between">
                                    <p className="font-bold text-slate-900 text-sm">
                                      {t.title}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-bold">
                                      {t.timestamp || ""}
                                    </p>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {t.detail}
                                  </p>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
