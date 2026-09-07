// TeacherBuddy - Live Grading Form Component
// Used in the split-view layout while watching presentations
import React, { useState, useEffect } from "react";
import { Save, X, MessageSquare, Award, AlertCircle } from "lucide-react";

interface GradingFormProps {
  submissionId: number;
  studentId: number;
  onSubmit: (grade: number, feedback: string) => Promise<void>;
  onClose: () => void;
  initialGrade?: number;
  initialFeedback?: string;
}

const LiveGradingForm: React.FC<GradingFormProps> = ({
  submissionId,
  studentId,
  onSubmit,
  onClose,
  initialGrade,
  initialFeedback,
}) => {
  const [grade, setGrade] = useState(initialGrade || 0);
  const [feedback, setFeedback] = useState(initialFeedback || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (grade < 0 || grade > 100) {
      setError("Grade must be between 0 and 100");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSubmit(grade, feedback);
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save grade");
    } finally {
      setSaving(false);
    }
  };

  const rubricItems = [
    { label: "Content & Accuracy", weight: 25, points: 0 },
    { label: "Delivery & Presentation", weight: 25, points: 0 },
    { label: "Visual Design", weight: 20, points: 0 },
    { label: "Engagement", weight: 20, points: 0 },
    { label: "Time Management", weight: 10, points: 0 },
  ];

  const gradeColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 80) return "text-blue-600";
    if (score >= 70) return "text-yellow-600";
    if (score >= 60) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-200 w-full max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-800">
            Grade Student #{studentId}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded transition"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border-b border-green-200 p-3 flex items-center gap-2 text-green-700">
          <Award className="w-5 h-5" />
          <span className="font-medium">Grade saved successfully!</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 p-3 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium text-sm">{error}</span>
        </div>
      )}

      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Grade Input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Overall Grade (0-100)
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              min="0"
              max="100"
              value={grade}
              onChange={(e) =>
                setGrade(
                  Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                )
              }
              disabled={saving || success}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className={`text-3xl font-bold ${gradeColor(grade)}`}>
              {grade}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {[25, 50, 75, 100].map((preset) => (
              <button
                key={preset}
                onClick={() => setGrade(preset)}
                disabled={saving || success}
                className="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded transition disabled:opacity-50"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Rubric Preview */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            Grading Rubric
          </p>
          <div className="space-y-2 bg-slate-50 p-3 rounded">
            {rubricItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-700">{item.label}</span>
                <span className="text-slate-500 font-medium">
                  {item.weight}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Feedback Textarea */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Teacher Feedback
            </div>
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={saving || success}
            placeholder="Add specific, constructive feedback for the student..."
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <p className="text-xs text-slate-500 mt-1">
            {feedback.length} characters
          </p>
        </div>

        {/* Quick Feedback Templates */}
        <div>
          <p className="text-xs font-medium text-slate-600 mb-2">
            Quick Feedback
          </p>
          <div className="space-y-1">
            {[
              "Great presentation! Well organized and clear.",
              "Work on pacing - slides went by too quickly.",
              "Excellent visuals and engaging content.",
              "Consider adding more audience interaction.",
              "Strong research and thorough analysis.",
            ].map((template, i) => (
              <button
                key={i}
                onClick={() =>
                  setFeedback((prev) =>
                    prev ? prev + "\n" + template : template,
                  )
                }
                disabled={saving || success}
                className="block w-full text-left px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded transition disabled:opacity-50"
              >
                + {template}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 p-4 border-t border-slate-200 bg-slate-50">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || success}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Grade
            </>
          )}
        </button>
      </div>
    </div>
  );
};

import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

// Live Grading Page Component (for use in Router)
export const LiveGradingPage: React.FC = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubmission = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.BASE}/slido/submissions/${submissionId}`);
        if (response.ok) {
          const data = await response.json();
          setSubmission(data);
        }
      } catch (error) {
        console.error("Failed to fetch submission:", error);
      } finally {
        setLoading(false);
      }
    };

    if (submissionId) fetchSubmission();
  }, [submissionId]);

  const handleGradeSubmit = async (grade: number, feedback: string) => {
    if (!user?.id) throw new Error("User not authenticated");

    const response = await fetch(
      `${API_ENDPOINTS.BASE}/slido/submissions/${submissionId}/grade?teacher_id=${user.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          teacher_feedback: feedback,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to save grade");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 font-bold">Submission not found</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 underline">Go Back</button>
      </div>
    );
  }

  return (
    <div className="p-8 flex justify-center bg-slate-50 min-h-screen">
      <LiveGradingForm
        submissionId={Number(submissionId)}
        studentId={submission.student_id}
        onSubmit={handleGradeSubmit}
        onClose={() => navigate(-1)}
        initialGrade={submission.grade}
        initialFeedback={submission.teacher_feedback}
      />
    </div>
  );
};

export default LiveGradingForm;
