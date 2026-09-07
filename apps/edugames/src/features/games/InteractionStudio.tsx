// InteractionStudio - Slido-like interaction authoring for presentations
// Students preview their PPTX and add polls/Q&A at specific slide breakpoints
import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  CheckCircle,
  BarChart3,
  MessageSquare,
  Type,
  Cloud,
  Star,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  AlertCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import PPTXViewer from "./PPTXViewer";
import { API_BASE_URL } from "../../shared/utils/gameAPI";

// ─── Types ────────────────────────────────────────────────────────
interface Interaction {
  id?: number;
  submission_id?: number;
  slide_number: number;
  interaction_type: string;
  config: InteractionConfig;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

interface InteractionConfig {
  question: string;
  options?: string[];
  settings?: Record<string, any>;
}

interface Props {
  submissionId: number;
  fileUrl: string;
  fileName: string;
  onFinalize: () => void;
  onBack: () => void;
}

// ─── Constants ────────────────────────────────────────────────────
const INTERACTION_TYPES = [
  { value: "poll_multiple_choice", label: "Multiple Choice", icon: BarChart3, color: "#2563eb" }, // Blue 600
  { value: "poll_open_text", label: "Open Text", icon: Type, color: "#0891b2" }, // Cyan 600
  { value: "poll_word_cloud", label: "Word Cloud", icon: Cloud, color: "#7c3aed" }, // Violet 600
  { value: "poll_rating", label: "Rating", icon: Star, color: "#d97706" }, // Amber 600
  { value: "qna_prompt", label: "Q&A Prompt", icon: MessageSquare, color: "#059669" }, // Emerald 600
];

const BRAND_BLUE = "#264796";
const BRAND_BLUE_LIGHT = "#3460c4";

// ─── Component ────────────────────────────────────────────────────
const InteractionStudio: React.FC<Props> = ({
  submissionId,
  fileUrl,
  fileName,
  onFinalize,
  onBack,
}) => {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for adding new interaction
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formSlide, setFormSlide] = useState(1);
  const [formType, setFormType] = useState("poll_multiple_choice");
  const [formQuestion, setFormQuestion] = useState("");
  const [formOptions, setFormOptions] = useState(["", ""]);

  // ─── Fetch existing interactions ──────────────────────────────
  useEffect(() => {
    fetchInteractions();
  }, [submissionId]);

  const fetchInteractions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/slido/submissions/${submissionId}/interactions`);
      if (res.ok) {
        setInteractions(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch interactions", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Reset form ───────────────────────────────────────────────
  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormSlide(1);
    setFormType("poll_multiple_choice");
    setFormQuestion("");
    setFormOptions(["", ""]);
    setError(null);
  };

  // ─── Save interaction ─────────────────────────────────────────
  const handleSaveInteraction = async () => {
    if (!formQuestion.trim()) {
      setError("Question text is required");
      return;
    }

    const needsOptions = formType === "poll_multiple_choice";
    const validOptions = formOptions.filter((o) => o.trim());
    if (needsOptions && validOptions.length < 2) {
      setError("Multiple choice needs at least 2 options");
      return;
    }

    setSaving(true);
    setError(null);

    const body: any = {
      slide_number: formSlide,
      interaction_type: formType,
      config: {
        question: formQuestion.trim(),
        ...(needsOptions ? { options: validOptions } : {}),
      },
      order_index: editingId 
        ? interactions.find(i => i.id === editingId)?.order_index || 0
        : interactions.filter((i) => i.slide_number === formSlide).length,
    };

    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`${API_BASE_URL}/slido/submissions/interactions/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/slido/submissions/${submissionId}/interactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to save");
      }

      await fetchInteractions();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete interaction ───────────────────────────────────────
  const handleDelete = async (interactionId: number) => {
    try {
      await fetch(`${API_BASE_URL}/slido/submissions/interactions/${interactionId}`, { method: "DELETE" });
      await fetchInteractions();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  // ─── Edit interaction ─────────────────────────────────────────
  const handleEdit = (interaction: Interaction) => {
    setEditingId(interaction.id!);
    setFormSlide(interaction.slide_number);
    setFormType(interaction.interaction_type);
    setFormQuestion(interaction.config.question);
    setFormOptions(interaction.config.options || ["", ""]);
    setShowForm(true);
  };

  // ─── Finalize submission ──────────────────────────────────────
  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/slido/submissions/${submissionId}/submit`, { method: "PUT" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Finalize failed");
      }
      onFinalize();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  };

  // ─── Group interactions by slide ──────────────────────────────
  const groupedBySlide: Record<number, Interaction[]> = {};
  interactions.forEach((i) => {
    if (!groupedBySlide[i.slide_number]) groupedBySlide[i.slide_number] = [];
    groupedBySlide[i.slide_number].push(i);
  });

  const typeInfo = (t: string) => INTERACTION_TYPES.find((x) => x.value === t) || INTERACTION_TYPES[0];

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-slate-500 hover:text-slate-900 transition text-sm px-3 py-1.5 rounded-lg hover:bg-slate-100 font-medium"
          >
            ← Back
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="bg-blue-50 p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Interaction Studio</h1>
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">EduAI Slido Mode</p>
          </div>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold ml-2">
            {interactions.length} Active
          </span>
        </div>

        <button
          onClick={handleFinalize}
          disabled={finalizing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition text-white"
          style={{
            background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})`,
            boxShadow: "0 4px 12px rgba(38, 71, 150, 0.25)",
          }}
        >
          {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Finalize & Submit
        </button>
      </div>

      <div className="flex h-[calc(100vh-72px)]">
        {/* ─── Left: PPTX Preview ─────────────────────────────── */}
        <div className="flex-1 bg-slate-200/50 flex flex-col p-6 overflow-hidden">
          <div className="flex-1 rounded-2xl overflow-hidden shadow-2xl bg-black border-4 border-white">
            <PPTXViewer fileUrl={fileUrl} fileName={fileName} title="Preview Your Slides" />
          </div>
        </div>

        {/* ─── Right: Interaction Panel ───────────────────────── */}
        <div className="w-[420px] flex flex-col overflow-hidden bg-white border-l border-slate-200 shadow-xl">
          {/* Panel Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-sm text-slate-700">Slide Interactions</span>
            </div>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition"
              style={{ background: "rgba(38,71,150,0.1)", color: "#264796" }}
            >
              <Plus className="w-3.5 h-3.5" /> Add New
            </button>
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div
              className="p-5 border-b border-slate-200 space-y-4"
              style={{ background: "rgba(38,71,150,0.03)" }}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wide">
                  {editingId ? "Edit Interaction" : "New Interaction"}
                </h4>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Slide Number */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Trigger after Slide #</label>
                <input
                  type="number"
                  min={1}
                  value={formSlide}
                  onChange={(e) => setFormSlide(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Type Selector */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Interaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTERACTION_TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = formType === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setFormType(t.value)}
                        className="flex items-center gap-2 px-2.5 py-2.5 rounded-xl text-xs font-bold transition border"
                        style={{
                          borderColor: active ? t.color : "#e2e8f0",
                          background: active ? `${t.color}08` : "#fff",
                          color: active ? t.color : "#64748b",
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Your Question</label>
                <textarea
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  rows={2}
                  placeholder="What would you like to ask?"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                />
              </div>

              {/* Options (only for multiple choice) */}
              {formType === "poll_multiple_choice" && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter block mb-1">Answer Options</label>
                  <div className="space-y-2">
                    {formOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={opt}
                          onChange={(e) => {
                            const copy = [...formOptions];
                            copy[i] = e.target.value;
                            setFormOptions(copy);
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        {formOptions.length > 2 && (
                          <button
                            onClick={() => setFormOptions(formOptions.filter((_, j) => j !== i))}
                            className="text-red-400 hover:text-red-600 p-1 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {formOptions.length < 6 && (
                      <button
                        onClick={() => setFormOptions([...formOptions, ""])}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1 ml-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Another Option
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveInteraction}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition text-white"
                  style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}, ${BRAND_BLUE_LIGHT})` }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {editingId ? "Update Interaction" : "Save Interaction"}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Interaction List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 opacity-20" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Studio...</p>
              </div>
            ) : interactions.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <Layers className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-800 font-bold">No interactions added yet</p>
                <p className="text-slate-500 text-xs mt-2 max-w-[200px] mx-auto">
                  Click the "Add New" button above to start making your presentation interactive.
                </p>
              </div>
            ) : (
              Object.keys(groupedBySlide)
                .sort((a, b) => Number(a) - Number(b))
                .map((slideNum) => (
                  <div key={slideNum} className="space-y-2">
                    <div className="flex items-center gap-2 px-2">
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        After Slide {slideNum}
                      </span>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>
                    <div className="space-y-2">
                      {groupedBySlide[Number(slideNum)].map((interaction) => {
                        const info = typeInfo(interaction.interaction_type);
                        const Icon = info.icon;
                        return (
                          <div
                            key={interaction.id}
                            className="bg-white rounded-2xl p-4 flex items-start gap-4 group transition border border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 shadow-sm"
                          >
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: `${info.color}10` }}
                            >
                              <Icon className="w-5 h-5" style={{ color: info.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 leading-snug">
                                {interaction.config.question}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span
                                  className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                                  style={{ background: `${info.color}15`, color: info.color }}
                                >
                                  {info.label}
                                </span>
                                {interaction.config.options && (
                                  <p className="text-[10px] font-medium text-slate-400 truncate">
                                    {interaction.config.options.length} options
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                              <button
                                onClick={() => handleEdit(interaction)}
                                className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition"
                                title="Edit"
                              >
                                <ChevronDown className="w-4 h-4 rotate-90" />
                              </button>
                              <button
                                onClick={() => interaction.id && handleDelete(interaction.id)}
                                className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Bottom Info */}
          <div className="p-4 border-t border-slate-100 text-[10px] font-bold text-slate-400 text-center bg-slate-50/50 uppercase tracking-widest">
            Ready for your live presentation
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractionStudio;

const X: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
