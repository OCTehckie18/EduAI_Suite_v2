// EduGames - Presentation Submission Portal
// Students upload their presentation files (.pptx only) with deadline tracking
// After upload, transitions to InteractionStudio for adding polls/Q&A before final submit
import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileCheck,
  AlertCircle,
  X,
  Clock,
  CheckCircle,
  Radio,
  Zap,
} from "lucide-react";
import InteractionStudio from "./InteractionStudio";
import PresenterView from "./PresenterView";
import { API_BASE_URL } from "../../shared/utils/gameAPI";

interface Assignment {
  id: number;
  title: string;
  description?: string;
  deadline?: string;
}

interface Submission {
  id: number;
  assignment_id: number;
  file_name: string;
  file_url: string;
  status: string;
  submitted_at: string;
  is_late: boolean;
  grade?: number;
}

const formatRelativeTime = (date: Date) => {
  const diffMs = date.getTime() - Date.now();
  const isFuture = diffMs > 0;
  const absSeconds = Math.abs(Math.round(diffMs / 1000));

  const units = [
    { label: "year", seconds: 60 * 60 * 24 * 365 },
    { label: "month", seconds: 60 * 60 * 24 * 30 },
    { label: "day", seconds: 60 * 60 * 24 },
    { label: "hour", seconds: 60 * 60 },
    { label: "minute", seconds: 60 },
  ] as const;

  for (const unit of units) {
    if (absSeconds >= unit.seconds) {
      const value = Math.round(absSeconds / unit.seconds);
      return isFuture ? `in ${value} ${unit.label}${value === 1 ? "" : "s"}` : `${value} ${unit.label}${value === 1 ? "" : "s"} ago`;
    }
  }

  return isFuture ? "in a few seconds" : "a few seconds ago";
};

const PresentationSubmissionPortal: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [studioMode, setStudioMode] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const studentId = localStorage.getItem("student_id") || "1";

  useEffect(() => {
    const fetchAssignmentAndSubmission = async () => {
      try {
        // Fetch assignments
        const assignmentsRes = await fetch(`${API_BASE_URL}/slido/assignments`);
        if (assignmentsRes.ok) {
          const assignmentsData = await assignmentsRes.json();
          setAssignments(assignmentsData);
          if (assignmentsData.length > 0) {
            // Select the most recent assignment
            const currentAssignment = assignmentsData[assignmentsData.length - 1];
            setAssignment(currentAssignment);

            // Fetch existing submission for this assignment and student
            const submissionsRes = await fetch(`${API_BASE_URL}/slido/submissions?assignment_id=${currentAssignment.id}&student_id=${studentId}`);
            if (submissionsRes.ok) {
              const submissionsData = await submissionsRes.json();
              if (submissionsData.length > 0) {
                const sub = submissionsData[0];
                setSubmission(sub);
                // If the last submission is still a draft, go straight to studio
                if (sub.status === "draft") {
                  setStudioMode(true);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch assignment data", err);
      }
    };

    fetchAssignmentAndSubmission();
  }, [studentId]);

  const isDeadlinePassed = (deadline?: string) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      return "Only .pptx files are accepted. Please export your presentation as PowerPoint format.";
    }
    if (file.size > 100 * 1024 * 1024) {
      return "File is too large. Maximum file size is 100MB.";
    }
    return null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!assignment) {
      setError("Please select an assignment first");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("assignment_id", assignment.id.toString());
      formData.append("student_id", studentId);
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/slido/submissions/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const data = await response.json();
      setSubmission(data);
      setError(null);
      // After upload, transition to Interaction Studio
      setStudioMode(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const isOverdue =
    assignment?.deadline && isDeadlinePassed(assignment.deadline);
  const deadlinePassed = isDeadlinePassed(assignment?.deadline);

  // ─── PresenterView Live Mode ──────────────────────────────
  if (liveMode && submission) {
    return (
      <PresenterView
        submissionId={submission.id}
        fileUrl={submission.file_url}
        fileName={submission.file_name}
        onBack={() => setLiveMode(false)}
      />
    );
  }

  // ─── InteractionStudio Mode ───────────────────────────────────
  if (studioMode && submission) {
    return (
      <InteractionStudio
        submissionId={submission.id}
        fileUrl={submission.file_url}
        fileName={submission.file_name}
        onFinalize={() => {
          setStudioMode(false);
          // Refresh submission to get updated status
          fetch(`${API_BASE_URL}/slido/submissions/${submission.id}`)
            .then((r) => r.json())
            .then((data) => setSubmission(data))
            .catch(console.error);
        }}
        onBack={() => {
          setStudioMode(false);
          setSubmission(null);
        }}
      />
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">
            Submit Your Presentation
          </h1>
          <p className="text-slate-600 mt-2">
            Upload your .pptx presentation file here
          </p>
        </div>

        {/* Assignment Selection */}
        {assignments.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Assignment
            </label>
            <select
              className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={assignment?.id || ""}
              onChange={(e) => {
                const selected = assignments.find((a) => a.id === parseInt(e.target.value));
                setAssignment(selected || null);
                setSubmission(null);
                if (selected) {
                  fetch(`${API_BASE_URL}/slido/submissions?assignment_id=${selected.id}&student_id=${studentId}`)
                    .then(res => res.json())
                    .then(data => {
                      if (data.length > 0) setSubmission(data[0]);
                    })
                    .catch(console.error);
                }
              }}
            >
              <option value="" disabled>Select an assignment...</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Assignment Card */}
        {assignment ? (
          <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <h2 className="text-xl font-semibold text-slate-800">
              {assignment.title}
            </h2>
            <p className="text-slate-600 mt-2">{assignment.description}</p>

            {/* Deadline Info */}
            {assignment.deadline && (
              <div
                className={`mt-4 flex items-center gap-2 p-3 rounded-lg ${isOverdue
                    ? "bg-red-50 text-red-700"
                    : "bg-blue-50 text-blue-700"
                  }`}
              >
                <Clock className="w-5 h-5" />
                {isOverdue ? (
                  <span className="font-medium">
                    Deadline passed on{" "}
                    {new Date(assignment.deadline).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="font-medium">
                    Due {formatRelativeTime(new Date(assignment.deadline))}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-blue-700">
            <AlertCircle className="w-5 h-5 inline mr-2" />
            No active assignment. Please contact your teacher.
          </div>
        )}

        {/* Submission Status */}
        {submission ? (
          <div className="bg-white rounded-lg p-6 shadow-sm mb-6 border-l-4 border-green-500">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-6 h-6 text-green-500" />
              <h3 className="text-lg font-semibold text-slate-800">
                Submission Received
              </h3>
            </div>

            <div className="space-y-3 text-slate-600">
              <p>
                <span className="font-medium text-slate-800">File:</span>{" "}
                {submission.file_name}
              </p>
              <p>
                <span className="font-medium text-slate-800">Submitted:</span>{" "}
                {formatRelativeTime(new Date(submission.submitted_at))}
              </p>
              {submission.is_late && (
                <p className="flex items-center gap-2 text-orange-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">Late submission</span>
                </p>
              )}
              {submission.grade !== undefined && submission.grade !== null && (
                <p>
                  <span className="font-medium text-slate-800">Grade:</span>{" "}
                  <span className="text-lg font-semibold text-green-600">
                    {submission.grade}/100
                  </span>
                </p>
              )}
            </div>

            <button
              onClick={() => setSubmission(null)}
              className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Submit Another File
            </button>

            {submission.status === "submitted" && (
              <button
                onClick={() => setLiveMode(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition"
                style={{
                  background: "linear-gradient(135deg, #264796, #3460c4)",
                  boxShadow: "0 4px 16px rgba(38,71,150,0.3)",
                }}
              >
                <Radio className="w-5 h-5" /> Go Live — Present Now
              </button>
            )}

            {submission.status === "draft" && (
              <button
                onClick={() => setStudioMode(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white transition"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: "0 4px 16px rgba(124,58,237,0.3)",
                }}
              >
                <Zap className="w-5 h-5" /> Open Interaction Studio
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Upload Area */}
            <div className="bg-white rounded-lg shadow-sm mb-6">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleClick}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${dragActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
                  } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pptx"
                  onChange={handleFileInput}
                  disabled={uploading}
                  className="hidden"
                />

                <div className="flex flex-col items-center">
                  <Upload className="w-12 h-12 text-slate-400 mb-3" />
                  <p className="text-lg font-medium text-slate-800 mb-1">
                    {uploading ? "Uploading..." : "Drop your presentation here"}
                  </p>
                  <p className="text-slate-500 text-sm">or click to browse</p>
                </div>

                {uploading && (
                  <div className="mt-4">
                    <div className="animate-spin inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                )}
              </div>

              {/* File Requirements */}
              <div className="p-4 bg-slate-50 border-t text-sm text-slate-600">
                <p className="font-medium text-slate-700 mb-2">Requirements:</p>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-green-500" />
                    PowerPoint format (.pptx)
                  </li>
                  <li className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-green-500" />
                    Maximum file size: 100MB
                  </li>
                  <li className="flex items-center gap-2">
                    {deadlinePassed ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <FileCheck className="w-4 h-4 text-green-500" />
                    )}
                    Submit before deadline
                  </li>
                </ul>
              </div>
            </div>
          </>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-800">Upload Error</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationSubmissionPortal;
