// TeacherBuddy - Presentation Assignments Dashboard
// This file manages presentation assignments, submissions, and grading
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Loader2,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  MoreVertical,
  GraduationCap,
  X,
} from "lucide-react";

interface Assignment {
  id: number;
  teacher_id: number;
  course_id?: number;
  title: string;
  description?: string;
  deadline?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface NewAssignmentForm {
  title: string;
  description: string;
  deadline: string;
}

interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  file_name: string;
  file_url: string;
  submitted_at: string;
  is_late: boolean;
  grade?: number;
  teacher_feedback?: string;
  graded_at?: string;
}

type FilterType = "all" | "pending" | "submitted" | "graded";

const formatDistanceToNowLocal = (
  date: Date,
  options?: { addSuffix?: boolean },
) => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  let value = "just now";
  if (minutes < 1) value = "less than a minute";
  else if (minutes < 60) value = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  else if (hours < 24) value = `${hours} hour${hours === 1 ? "" : "s"}`;
  else value = `${days} day${days === 1 ? "" : "s"}`;

  if (!options?.addSuffix) return value;
  return diffMs < 0 ? `${value} ago` : `in ${value}`;
};

const SlidoAssignmentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<number | null>(
    null,
  );
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<NewAssignmentForm>({
    title: "",
    description: "",
    deadline: "",
  });
  const [saving, setSaving] = useState(false);
  const teacherId = localStorage.getItem("teacher_id") || "1";

  useEffect(() => {
    fetchAssignments();
    fetchAllSubmissions();
  }, []);

  const fetchAssignments = async () => {
    try {
      const response = await fetch(
        `/api/slido/assignments?teacher_id=${teacherId}`,
      );
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setAssignments(data);
      } else {
        console.error("Error fetching assignments:", data);
        setAssignments([]);
      }
    } catch (error) {
      console.error("Error fetching assignments:", error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSubmissions = async () => {
    try {
      const response = await fetch(`/api/slido/submissions`);
      const data = await response.json();
      if (response.ok && Array.isArray(data)) {
        setSubmissions(data);
      } else {
        console.error("Error fetching submissions:", data);
        setSubmissions([]);
      }
    } catch (error) {
      console.error("Error fetching submissions:", error);
      setSubmissions([]);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert("Please enter an assignment title");
      return;
    }

    setSaving(true);
    try {
      let deadline = null;
      if (formData.deadline) {
        deadline = new Date(formData.deadline).toISOString();
      }

      const response = await fetch(
        `/api/slido/assignments?teacher_id=${teacherId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            deadline,
          }),
        },
      );

      if (!response.ok) {
        let errorMessage = "Failed to create assignment";
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      const newAssignment = await response.json();
      setAssignments([...assignments, newAssignment]);
      setShowCreateModal(false);
      setFormData({ title: "", description: "", deadline: "" });
    } catch (error) {
      console.error("Error creating assignment:", error);
      alert(
        `Failed to create assignment: ${error instanceof Error ? error.message : "Please try again."}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const getSubmissionStatus = (assignment: Assignment) => {
    const assignmentSubmissions = submissions.filter(
      (s) => s.assignment_id === assignment.id,
    );
    const totalSubmitted = assignmentSubmissions.length;
    const totalGraded = assignmentSubmissions.filter(
      (s) => s.grade !== null,
    ).length;

    return {
      submitted: totalSubmitted,
      graded: totalGraded,
      pending: totalSubmitted - totalGraded,
    };
  };

  const isOverdue = (deadline?: string) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  const filteredAssignments = assignments.filter((a) => {
    if (filter === "all") return true;
    const status = getSubmissionStatus(a);
    if (filter === "pending") return status.submitted === 0;
    if (filter === "submitted")
      return status.submitted > 0 && status.pending > 0;
    if (filter === "graded")
      return status.pending === 0 && status.submitted > 0;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart className="w-8 h-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-slate-800">
                Presentation Assignments
              </h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-5 h-5" />
              New Assignment
            </button>
          </div>
          <p className="text-slate-600 mt-2">
            Manage student presentations, track submissions, and grade in
            real-time
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 bg-white rounded-lg p-1 w-fit shadow-sm">
          {(["all", "pending", "submitted", "graded"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded transition font-medium capitalize ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Assignments Grid */}
        <div className="grid gap-4">
          {filteredAssignments.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center shadow-sm">
              <GraduationCap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-lg">No assignments found</p>
              <p className="text-slate-500 text-sm">
                Create a new assignment to get started
              </p>
            </div>
          ) : (
            filteredAssignments.map((assignment) => {
              const status = getSubmissionStatus(assignment);
              const overdue = isOverdue(assignment.deadline);
              const isSelected = selectedAssignment === assignment.id;

              return (
                <div
                  key={assignment.id}
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition"
                >
                  {/* Assignment Header */}
                  <div
                    className="p-4 cursor-pointer border-l-4 border-blue-600"
                    onClick={() =>
                      setSelectedAssignment(isSelected ? null : assignment.id)
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-800">
                          {assignment.title}
                        </h3>
                        <p className="text-slate-600 text-sm mt-1">
                          {assignment.description}
                        </p>
                      </div>
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition">
                        <MoreVertical className="w-5 h-5 text-slate-400" />
                      </button>
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center gap-4 mt-4">
                      <div className="flex items-center gap-1 text-slate-600 text-sm">
                        <Clock className="w-4 h-4" />
                        {assignment.deadline ? (
                          <>
                            {overdue ? (
                              <span className="text-red-600">Overdue</span>
                            ) : (
                              <span>
                                {formatDistanceToNowLocal(
                                  new Date(assignment.deadline),
                                  { addSuffix: true },
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          <span>No deadline</span>
                        )}
                      </div>

                      <div className="flex gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                          <span className="text-slate-600">
                            <strong>{status.submitted}</strong> submitted
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-slate-600">
                            <strong>{status.graded}</strong> graded
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submissions Table */}
                  {isSelected && submissions.filter(s => s.assignment_id === assignment.id).length > 0 && (
                    <div className="border-t bg-slate-50 overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-100">
                          <tr className="text-sm font-semibold text-slate-700">
                            <th className="px-4 py-3 text-left">Student</th>
                            <th className="px-4 py-3 text-left">File</th>
                            <th className="px-4 py-3 text-left">Submitted</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Grade</th>
                            <th className="px-4 py-3 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {submissions.filter(s => s.assignment_id === assignment.id).map((sub) => (
                            <tr
                              key={sub.id}
                              className="border-t hover:bg-slate-100 transition"
                            >
                              <td className="px-4 py-3 text-slate-700">
                                Student #{sub.student_id}
                              </td>
                              <td className="px-4 py-3">
                                <a
                                  href={sub.file_url}
                                  className="text-blue-600 hover:underline truncate max-w-xs block"
                                >
                                  {sub.file_name}
                                </a>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {formatDistanceToNowLocal(
                                  new Date(sub.submitted_at),
                                  { addSuffix: true },
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {sub.is_late ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
                                    <AlertCircle className="w-3 h-3" /> Late
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    <CheckCircle className="w-3 h-3" /> On time
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {sub.grade !== null ? (
                                  <span className="font-semibold text-slate-700">
                                    {sub.grade}/100
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Not graded
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/games/slido/grade/${sub.id}`); }}
                                    className="p-1.5 hover:bg-blue-50 rounded-lg transition group"
                                    title="View & Grade"
                                  >
                                    <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/games/slido/grade/${sub.id}`); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition"
                                    title="Grade presentation"
                                  >
                                    <Edit className="w-3.5 h-3.5" /> Grade
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create Assignment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-slate-800">
                New Assignment
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Final Presentation Project"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Add assignment details..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Deadline
                </label>
                <input
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) =>
                    setFormData({ ...formData, deadline: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlidoAssignmentDashboard;
