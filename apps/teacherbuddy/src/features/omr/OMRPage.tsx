
import React, { useState, useEffect, useRef } from "react";
import { Upload, Plus, CheckSquare, AlertTriangle, FileImage, ArrowLeft, ChevronRight, CheckCircle2, Save, X, Trash2, Edit, Download, BarChart3, Files } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

import { API_ENDPOINTS, API_BASE_URL } from "../../shared/utils/apiConfig";

const API_URL = API_ENDPOINTS.OMR;

export const OMRPage: React.FC = () => {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Form states
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newAnswerKeyStr, setNewAnswerKeyStr] = useState("{\n  \"1\": \"A\",\n  \"2\": \"B\",\n  \"3\": \"C\",\n  \"4\": \"D\"\n}");
  const [creationMode, setCreationMode] = useState<'image' | 'manual'>('image');
  const [keyImageFile, setKeyImageFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const keyImageRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [uploadStudentId, setUploadStudentId] = useState("");

  useEffect(() => {
    if (view === 'list') {
      fetchJobs();
    }
  }, [view]);

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_URL}/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSubmissions = async (jobId: number) => {
    try {
      const res = await fetch(`${API_URL}/jobs/${jobId}/submissions`);
      if (res.ok) {
        const subs = await res.json();
        setSubmissions(subs);
        if (selectedSub) {
          const updated = subs.find((s: any) => s.id === selectedSub.id);
          setSelectedSub(updated);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const createJob = async () => {
    if (!newJobTitle.trim()) {
      alert("Please provide a job title");
      return;
    }

    const formData = new FormData();
    formData.append('title', newJobTitle);

    if (creationMode === 'manual') {
      formData.append('answer_key', newAnswerKeyStr);
    } else {
      if (!keyImageFile) {
        alert("Please select an answer key image");
        return;
      }
      formData.append('file', keyImageFile);
    }

    try {
      const url = selectedJob ? `${API_URL}/jobs/${selectedJob.id}` : `${API_URL}/jobs`;
      const method = selectedJob ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method: method,
        body: formData
      });
      if (res.ok) {
        setView('list');
        setNewJobTitle("");
        setKeyImageFile(null);
        setSelectedJob(null);
      } else {
        alert("Error creating job. Please check your inputs.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteJob = async (id: number) => {
    if (!confirm("Are you sure you want to delete this job and all its submissions?")) return;
    try {
      const res = await fetch(`${API_URL}/jobs/${id}`, { method: "DELETE" });
      if (res.ok) fetchJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const editJob = (job: any) => {
    setSelectedJob(job);
    setNewJobTitle(job.title);
    setNewAnswerKeyStr(JSON.stringify(job.answer_key, null, 2));
    setCreationMode('manual');
    setView('create');
  };

  const handleUploadSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!uploadStudentId) {
      alert("Please enter a student ID first");
      return;
    }

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("student_id", uploadStudentId);
    formData.append("file", file);

    // Reset file input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const res = await fetch(`${API_URL}/jobs/${selectedJob.id}/upload`, {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        alert("Uploaded and processed successfully!");
        setUploadStudentId("");
        fetchSubmissions(selectedJob.id);
      }
    } catch (e) {
      console.error(e);
      alert("Error uploading sheet");
    }
  };

  const verifyAndSave = async () => {
    if (!selectedSub) return;

    const formData = new FormData();
    formData.append("score", selectedSub.score);
    formData.append("detected_answers", JSON.stringify(selectedSub.detected_answers));

    try {
      const res = await fetch(`${API_URL}/submissions/${selectedSub.id}`, {
        method: "PUT",
        body: formData
      });
      if (res.ok) {
        alert("Marks verified and saved!");
        fetchSubmissions(selectedJob.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedJob) return;
    setBatchUploading(true);
    const formData = new FormData();
    formData.append("student_ids", "");
    Array.from(e.target.files).forEach(f => formData.append("files", f));
    try {
      const res = await fetch(`${API_URL}/jobs/${selectedJob.id}/upload-batch`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        alert(`Batch uploaded: ${data.count} sheets processed`);
        fetchSubmissions(selectedJob.id);
      }
    } catch (err) { console.error(err); }
    setBatchUploading(false);
    if (batchInputRef.current) batchInputRef.current.value = '';
  };

  const downloadExport = (format: 'excel' | 'csv') => {
    if (!selectedJob) return;
    const url = `${API_URL}/jobs/${selectedJob.id}/export/${format}`;
    window.open(url, '_blank');
  };

  const fetchAnalytics = async () => {
    if (!selectedJob) return;
    try {
      const res = await fetch(`${API_URL}/jobs/${selectedJob.id}/analytics`);
      if (res.ok) { setAnalytics(await res.json()); setShowAnalytics(true); }
    } catch (e) { console.error(e); }
  };

  const renderList = () => (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>OMR Evaluation</h1>
          <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>Bulk grading of physical answer sheets.</p>
        </div>
        <button onClick={() => setView('create')} className="btn btn-primary shadow-lg flex items-center gap-2">
          <Plus size={16} /> New Job
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.map(job => (
          <GlassCard key={job.id} className="p-6 cursor-pointer hover:scale-[1.02] transition-transform relative group" onClick={() => { setSelectedJob(job); setView('detail'); fetchSubmissions(job.id); }}>
            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); editJob(job); }}
                className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
              >
                <Edit size={14} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: "var(--color-text-primary)" }}>{job.title}</h3>
            <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>Questions: {Object.keys(job.answer_key).length}</p>
            <div className="text-sm font-medium text-blue-600 flex items-center justify-between">
              Open Dashboard <ChevronRight size={16} />
            </div>
          </GlassCard>
        ))}
        {jobs.length === 0 && (
          <div className="col-span-full p-8 text-center" style={{ color: "var(--color-text-muted)" }}>
            No evaluation jobs found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );

  const renderCreate = () => (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm hover:underline" style={{ color: "var(--color-text-secondary)" }}>
        <ArrowLeft size={16} /> Back
      </button>
      <GlassCard className="p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Create OMR Job</h2>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>Provide a title and the master answer key (JSON format).</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>Job Title</label>
            <input
              type="text"
              value={newJobTitle}
              onChange={e => setNewJobTitle(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border focus:ring-2 outline-none"
              style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              placeholder="e.g. Midterm Computer Science"
            />
          </div>

          <div className="flex gap-4 border-b pb-2 mb-4" style={{ borderColor: 'var(--color-border)' }}>
            <button
              className={`text-sm font-bold pb-2 border-b-2 ${creationMode === 'image' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}
              onClick={() => setCreationMode('image')}
            >
              Upload Image (Extract)
            </button>
            <button
              className={`text-sm font-bold pb-2 border-b-2 ${creationMode === 'manual' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}
              onClick={() => setCreationMode('manual')}
            >
              Manual JSON Entry
            </button>
          </div>

          {creationMode === 'manual' ? (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>Answer Key (JSON)</label>
              <textarea
                rows={8}
                value={newAnswerKeyStr}
                onChange={e => setNewAnswerKeyStr(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border focus:ring-2 outline-none font-mono text-sm"
                style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              />
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-xl p-8 text-center" style={{ borderColor: "var(--color-border)" }}>
              <input
                type="file"
                ref={keyImageRef}
                className="hidden"
                accept="image/*"
                onChange={e => setKeyImageFile(e.target.files?.[0] || null)}
              />
              <FileImage size={40} className="mx-auto mb-3" style={{ color: "var(--color-brand-blue)" }} />
              {keyImageFile ? (
                <p className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>{keyImageFile.name}</p>
              ) : (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Select the master answer key image</p>
              )}
              <button
                onClick={() => keyImageRef.current?.click()}
                className="btn btn-secondary mt-4 text-sm shadow-sm"
              >
                Browse Image
              </button>
            </div>
          )}

          <button onClick={createJob} className="btn btn-primary w-full py-3 shadow-md mt-4">Create Job</button>
        </div>
      </GlassCard>
    </div>
  );

  const renderDetail = () => (
    <div className="space-y-6 animate-fade-in-up flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('list')} className="p-2 rounded-full hover:bg-black/5">
            <ArrowLeft size={20} style={{ color: "var(--color-text-primary)" }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>{selectedJob?.title}</h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Manage answer sheets and verifications.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white/50 p-2 rounded-xl border border-white/20 shadow-sm flex-wrap">
          <input
            type="text"
            placeholder="Student ID (Reg No)"
            value={uploadStudentId}
            onChange={e => setUploadStudentId(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border outline-none"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)", color: "var(--color-text-primary)" }}
          />
          <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary text-sm py-1.5 px-4 shadow flex items-center gap-2">
            <Upload size={14} /> Upload Sheet
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUploadSheet} />
          <button onClick={() => batchInputRef.current?.click()} disabled={batchUploading} className="btn btn-secondary text-sm py-1.5 px-4 shadow flex items-center gap-2">
            <Files size={14} /> {batchUploading ? 'Uploading...' : 'Batch Upload'}
          </button>
          <input type="file" ref={batchInputRef} className="hidden" accept="image/*,application/pdf" multiple onChange={handleBatchUpload} />
          <button onClick={() => downloadExport('excel')} className="btn btn-secondary text-sm py-1.5 px-3 shadow flex items-center gap-1" title="Download Excel">
            <Download size={14} /> Excel
          </button>
          <button onClick={() => downloadExport('csv')} className="btn btn-secondary text-sm py-1.5 px-3 shadow flex items-center gap-1" title="Download CSV">
            <Download size={14} /> CSV
          </button>
          <button onClick={fetchAnalytics} className="btn btn-secondary text-sm py-1.5 px-3 shadow flex items-center gap-1" title="Question Analytics">
            <BarChart3 size={14} /> Analytics
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden min-h-[500px]">
        {/* Left Submissions List */}
        <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2">
          {submissions.length === 0 && (
            <div className="p-6 text-center text-sm border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              No submissions yet. Upload an answer sheet image.
            </div>
          )}
          {submissions.map(sub => (
            <GlassCard
              key={sub.id}
              className={`p-4 cursor-pointer transition-all ${selectedSub?.id === sub.id ? 'ring-2 ring-blue-500' : 'hover:scale-[1.02]'}`}
              onClick={() => setSelectedSub(sub)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>{sub.student_id}</p>
                </div>
                {sub.status === 'verified' ? (
                  <span className="badge badge-green bg-green-50 text-green-600 flex items-center gap-1 text-[10px]"><CheckCircle2 size={12} /> Verified</span>
                ) : (
                  <span className="badge badge-orange bg-orange-50 text-orange-600 flex items-center gap-1 text-[10px]"><AlertTriangle size={12} /> Pending</span>
                )}
              </div>
              <div className="flex justify-between items-end mt-4">
                <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>OMR Score: <strong className="text-lg" style={{ color: "var(--color-brand-blue)" }}>{sub.score?.toFixed(1)}</strong>%</p>
                <ChevronRight size={16} style={{ color: "var(--color-text-muted)" }} />
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Right Editor */}
        <div className="lg:col-span-2">
          {selectedSub ? (
            <GlassCard className="h-full flex flex-col overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: "var(--color-border)" }}>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Submission: {selectedSub.student_id}</h2>
                  <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Review and correct OMR evaluation.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right flex items-center gap-2">
                    <p className="text-xs font-bold" style={{ color: "var(--color-text-muted)" }}>FINAL SCORE</p>
                    <input
                      type="number"
                      value={selectedSub.score}
                      onChange={e => setSelectedSub({ ...selectedSub, score: parseFloat(e.target.value) })}
                      className="w-20 text-center font-bold text-xl py-1 rounded-lg border focus:ring-2 outline-none"
                      style={{ color: "var(--color-brand-blue)", borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}
                    />
                  </div>
                  <button onClick={verifyAndSave} className="btn btn-primary py-1.5 px-4 shadow flex items-center gap-2 text-sm">
                    <CheckSquare size={16} /> Confirm Marks
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                {/* Image Viewer */}
                <div className="w-full md:w-1/2 p-4 border-r" style={{ borderColor: "var(--color-border)" }}>
                  <div className="w-full h-full bg-black/5 rounded-xl border flex items-center justify-center overflow-hidden relative group" style={{ borderColor: "var(--color-border)" }}>
                    {selectedSub.image_url ? (
                      <img src={`${API_BASE_URL}${selectedSub.image_url}`} alt="Answer Sheet" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <div className="text-center text-gray-400">
                        <FileImage size={48} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No Image</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Questions List */}
                <div className="w-full md:w-1/2 p-4 overflow-y-auto space-y-3">
                  <h3 className="font-bold text-sm mb-3 uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Detected Answers vs Key</h3>
                  {Object.entries(selectedJob?.answer_key || {}).map(([qNo, correctAns]: [string, any]) => {
                    const detected = selectedSub.detected_answers?.[qNo] || "-";
                    const isCorrect = detected === correctAns;
                    const isUncertain = detected === "?" || detected === "-";
                    const bgClass = isUncertain ? 'bg-yellow-50/50 border-yellow-200' : isCorrect ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100';
                    return (
                      <div key={qNo} className={`p-3 rounded-xl border flex items-center justify-between ${bgClass}`}>
                        <div className="flex items-center gap-4">
                          <span className="font-bold w-6 text-right" style={{ color: "var(--color-text-primary)" }}>Q{qNo}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Detected:</span>
                            <input
                              className="w-8 text-center font-bold text-sm py-0.5 rounded border focus:ring-1 outline-none uppercase"
                              value={detected}
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase().slice(0, 1);
                                setSelectedSub({
                                  ...selectedSub,
                                  detected_answers: { ...selectedSub.detected_answers, [qNo]: val }
                                });
                              }}
                            />
                          </div>
                          {isUncertain && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-bold">UNCERTAIN</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Key:</span>
                          <span className="font-bold text-sm w-6 text-center">{correctAns}</span>
                          {isUncertain ? <AlertTriangle size={16} className="text-yellow-500 ml-2" /> : isCorrect ? <CheckCircle2 size={16} className="text-green-500 ml-2" /> : <X size={16} className="text-red-500 ml-2" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="h-full flex flex-col overflow-hidden p-6">
              <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-text-primary)" }}>Master Answer Key</h2>
              <p className="text-sm mb-6" style={{ color: "var(--color-text-secondary)" }}>Correct answers expected for this evaluation batch.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 overflow-y-auto pr-2 pb-4 content-start">
                {Object.entries(selectedJob?.answer_key || {}).map(([qNo, ans]: [string, any]) => (
                  <div key={qNo} className="p-3 rounded-xl border flex items-center justify-between shadow-sm" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}>
                    <span className="font-bold text-sm text-gray-500">Q{qNo}</span>
                    <span className="font-bold text-lg" style={{ color: "var(--color-brand-blue)" }}>{ans}</span>
                  </div>
                ))}
              </div>
              {Object.keys(selectedJob?.answer_key || {}).length === 0 && (
                <div className="text-center p-8 border-2 border-dashed rounded-xl mt-4" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                  No answer key mapped.
                </div>
              )}
            </GlassCard>
          )}
        </div>
      </div>

      {/* Analytics Modal */}
      {showAnalytics && analytics && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAnalytics(false)}>
          <GlassCard className="max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>Question Analytics ({analytics.total_students} students)</h2>
              <button onClick={() => setShowAnalytics(false)} className="p-1 rounded hover:bg-black/10"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {(analytics.analysis || []).map((q: any) => {
                const pct = q.correct_percentage;
                const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={q.question} className="p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm">Q{q.question} (Key: {q.correct_answer})</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: barColor + '22', color: barColor }}>{q.difficulty}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <div className="flex gap-4 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="text-green-600"> {q.correct_count}</span>
                      <span className="text-red-600"> {q.wrong_count}</span>
                      <span className="text-yellow-600">? {q.uncertain_count}</span>
                      <span>{pct}% correct</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full">
      {view === 'list' && renderList()}
      {view === 'create' && renderCreate()}
      {view === 'detail' && renderDetail()}
    </div>
  );
};
