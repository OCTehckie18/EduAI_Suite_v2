import React, { useState, useEffect, useRef } from "react";
import { FileSpreadsheet, Download, RefreshCw, Send, Users, X, Upload, FileText, CheckCircle, AlertTriangle } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { useTheme } from "../../shared/hooks/useTheme";
import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

export const ReportsPage: React.FC = () => {
  const { isDark } = useTheme();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newReportType, setNewReportType] = useState('Student Report');
  const [newReportTargetId, setNewReportTargetId] = useState(1);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendEmailAddress, setSendEmailAddress] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<any>(null);

  // Template upload state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateTargetId, setTemplateTargetId] = useState<number | undefined>(undefined);
  const [templateError, setTemplateError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [manualStep, setManualStep] = useState<'upload' | 'review' | 'generated'>('upload');
  const [detectedFields, setDetectedFields] = useState<string[]>([]);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});
  const [meetingNotes, setMeetingNotes] = useState("");
  const [manualResult, setManualResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.REPORTS}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    }
  };

  const fetchMeta = async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(API_ENDPOINTS.COURSES),
        fetch(API_ENDPOINTS.STUDENTS)
      ]);
      if (cRes.ok) setAvailableCourses(await cRes.json());
      if (sRes.ok) setAvailableStudents(await sRes.json());
    } catch (err) {
      console.error("Failed to fetch metadata:", err);
    }
  };

  useEffect(() => {
    fetchReports();
    fetchMeta();
    const interval = setInterval(fetchReports, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (newReportType === 'Student Report' && availableStudents.length > 0) {
      setNewReportTargetId(availableStudents[0].id);
    } else if (newReportType === 'Class Report' && availableCourses.length > 0) {
      setNewReportTargetId(availableCourses[0].id);
    }
  }, [newReportType, availableCourses.length, availableStudents.length]);

  const handleGenerate = async (type: string, target_id: number) => {
    try {
      setLoading(true);
      await fetch(`${API_ENDPOINTS.REPORTS}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, target_id })
      });
      fetchReports();
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to generate report:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (rep: any) => {
    // If it's a template report with DOCX, download via the API
    if (rep.type === 'Template Report' || rep.type === 'Manual Report' || rep.type === 'Event Report') {
      try {
        const res = await fetch(`${API_ENDPOINTS.REPORTS}/${rep.id}/download`);
        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${rep.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        } else {
          alert('Failed to download report.');
        }
      } catch (err) {
        console.error('Download error:', err);
        alert('Error downloading report.');
      }
      return;
    }
    // Fallback: existing txt download
    if (!rep.content) return;
    const blob = new Blob([rep.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rep.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSendClick = (rep: any) => {
    setSelectedReportId(rep.id);
    setSendEmailAddress("");
    setIsSendModalOpen(true);
  };

  const confirmSend = async () => {
    if (!sendEmailAddress) {
      alert("Please enter an email address.");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/${selectedReportId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sendEmailAddress })
      });
      if (res.ok) {
        alert('Report sent successfully!');
        setIsSendModalOpen(false);
      } else {
        const data = await res.json();
        alert(`Failed to send: ${data.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error sending report.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewClick = (rep: any) => {
    setViewingReport(rep);
    setIsViewModalOpen(true);
  };

  const openModal = (type: string) => {
    setNewReportType(type);
    setIsModalOpen(true);
  };

  // --- Template upload handlers ---
  const handleTemplateFileChange = (file: File | null) => {
    setTemplateError("");
    if (file && !file.name.toLowerCase().endsWith('.docx')) {
      setTemplateError('Upload the editable DOCX template so its formatting can be preserved exactly.');
      return;
    }
    setTemplateFile(file);
    setManualStep('upload');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleTemplateFileChange(file);
  };

  const handleTemplateScan = async () => {
    if (!templateFile) {
      setTemplateError('Please upload the editable DOCX template first.');
      return;
    }
    try {
      setLoading(true);
      setTemplateError("");
      const formData = new FormData();
      formData.append('template_file', templateFile);
      formData.append('meeting_notes', meetingNotes);
      if (templateTargetId) formData.append('target_id', String(templateTargetId));
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/scan-template`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setDetectedFields(data.fields_detected || []);
        setFieldOverrides(data.preview_mapping || {});
        setRequiredFields(data.fields_requiring_teacher || []);
        setManualStep('review');
      } else {
        const data = await res.json();
        setTemplateError(data.detail || 'Failed to generate report.');
      }
    } catch (err) {
      console.error(err);
      setTemplateError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateGenerate = async () => {
    if (!templateFile) return;
    try {
      setLoading(true);
      setTemplateError("");
      const formData = new FormData();
      formData.append('template_file', templateFile);
      formData.append('meeting_notes', meetingNotes);
      formData.append('field_overrides', JSON.stringify(fieldOverrides));
      if (templateTargetId) formData.append('target_id', String(templateTargetId));
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/generate-manual`, { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json();
        setTemplateError(data.detail || 'Failed to generate manual report.');
        return;
      }
      const data = await res.json();
      setManualResult(data);
      setRequiredFields(data.fields_requiring_teacher || []);
      setManualStep('generated');
      fetchReports();
    } catch (err) {
      console.error(err);
      setTemplateError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEventReportGenerate = async () => {
    if (!meetingNotes.trim()) {
      setTemplateError('Add the meeting or event notes before generating the report.');
      return;
    }
    try {
      setLoading(true);
      setTemplateError("");
      const formData = new FormData();
      formData.append('meeting_notes', meetingNotes);
      if (templateTargetId) formData.append('target_id', String(templateTargetId));
      const res = await fetch(`${API_ENDPOINTS.REPORTS}/generate-event`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setTemplateError(data.detail || 'Failed to generate event report.');
        return;
      }
      setRequiredFields(data.fields_requiring_teacher || []);
      setManualResult(data);
      setManualStep('generated');
      fetchReports();
    } catch (err) {
      console.error(err);
      setTemplateError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetTemplateModal = () => {
    setIsTemplateModalOpen(false);
    setTemplateFile(null);
    setTemplateTargetId(undefined);
    setDetectedFields([]);
    setFieldOverrides({});
    setRequiredFields([]);
    setMeetingNotes("");
    setManualResult(null);
    setManualStep('upload');
    setTemplateError("");
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Report Generation Center</h1>
          <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>Automated, AI-filled academic reports ready for parents and administration.</p>
        </div>
        <button onClick={() => openModal('Student Report')} className="btn btn-primary shadow-lg flex items-center gap-2">
          <FileSpreadsheet size={16} /> New Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { type: 'Class Report', title: 'Class-Level Reports', desc: 'Generate aggregated performance stats.', icon: <Users size={20} />, color: 'blue' },
          { type: 'Student Report', title: 'Parent-Ready Auto Reports', desc: 'AI summarizes student strengths & weaknesses.', icon: <FileSpreadsheet size={20} />, color: 'green' },
        ].map((item) => (
          <GlassCard key={item.title} className="p-6 group hover:scale-[1.02] transition-all duration-300">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300 ${item.color === 'blue' ? 'bg-[#264796]/10 text-[#264796] group-hover:bg-[#264796] group-hover:text-white' :
              'bg-[#d0ae61]/10 text-[#d0ae61] group-hover:bg-[#d0ae61] group-hover:text-white'
              }`}>
              {item.icon}
            </div>
            <h3 className="text-lg font-bold mb-2 font-display" style={{ color: "var(--color-text-primary)" }}>{item.title}</h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{item.desc}</p>
            <button
              onClick={() => openModal(item.type)}
              className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-all duration-300 ${item.color === 'blue' ? 'text-[#264796] hover:text-[#2a52a8]' :
                'text-[#d0ae61] hover:text-[#ddb867]'
                }`}
            >
              Generate
              <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
            </button>
          </GlassCard>
        ))}

        {/* Template Upload Card */}
        <GlassCard className="p-6 group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full" />
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300 bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white">
            <Upload size={20} />
          </div>
          <h3 className="text-lg font-bold mb-2 font-display" style={{ color: "var(--color-text-primary)" }}>Event Reports</h3>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>Turn meeting or event notes into the university activity report.</p>
          <button
            onClick={() => { setIsTemplateModalOpen(true); setTemplateError(""); setTemplateFile(null); setManualStep('upload'); setMeetingNotes(''); setManualResult(null); }}
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider transition-all duration-300 text-purple-400 hover:text-purple-300"
          >
            Create Event Report
            <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
          </button>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden mt-6">
        <div className="p-5 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>Recent Reports</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead style={{ background: "rgba(0,0,0,0.02)", color: "var(--color-text-secondary)" }}>
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[11px]">ID</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[11px]">Report Name</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[11px]">Type</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[11px]">Generated</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[11px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No reports generated yet.</td>
                </tr>
              ) : reports.map(rep => (
                <tr key={rep.id} className="hover:bg-black/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{rep.id}</td>
                  <td className="px-6 py-4 font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    <div className="flex items-center gap-2">
                      {rep.status === 'generating' && <RefreshCw size={14} className="animate-spin text-[#264796]" />}
                      {rep.status === 'failed' && <span className="text-red-500 text-xs px-1 border border-red-500 rounded">Failed</span>}
                      {(rep.type === 'Template Report' || rep.type === 'Manual Report' || rep.type === 'Event Report') && <span className="text-purple-400 text-[10px] px-1.5 py-0.5 border border-purple-400/40 rounded-md bg-purple-400/5 font-bold uppercase tracking-wider">Event</span>}
                      {rep.name}
                    </div>
                  </td>
                  <td className="px-6 py-4" style={{ color: "var(--color-text-secondary)" }}>{rep.type}</td>
                  <td className="px-6 py-4" style={{ color: "var(--color-text-secondary)" }}>{rep.date}</td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button onClick={() => handleViewClick(rep)} disabled={rep.status !== 'ready'} className="text-gray-500 hover:text-[#264796] disabled:opacity-30" title="View Content"><FileSpreadsheet size={16} /></button>
                    <button onClick={() => handleDownload(rep)} disabled={rep.status !== 'ready'} className="text-gray-500 hover:text-[#264796] disabled:opacity-30" title="Download"><Download size={16} /></button>
                    <button onClick={() => handleSendClick(rep)} disabled={rep.status !== 'ready'} className="text-gray-500 hover:text-[#d0ae61] disabled:opacity-30" title="Send"><Send size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div
            className="bg-[#121212] rounded-2xl max-w-md w-full overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 pt-8 pb-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white font-display mb-1">Generate Report</h2>
                  <p className="text-gray-400 text-sm">Configure your automated report parameters.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#d0ae61] mb-2 ml-1">Report Type</label>
                  <div className="relative group">
                    <select
                      value={newReportType}
                      onChange={(e) => setNewReportType(e.target.value)}
                      className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#264796]/50 transition-all cursor-pointer hover:bg-white/10"
                    >
                      <option value="Student Report" className="bg-[#1a1a1a]">Student Report</option>
                      <option value="Class Report" className="bg-[#1a1a1a]">Class Report</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <Users size={16} />
                    </div>
                  </div>
                </div>

                {newReportType !== 'Analytics Export' && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <label className="block text-xs font-bold uppercase tracking-widest text-[#d0ae61] mb-2 ml-1">
                      {newReportType === 'Student Report' ? 'Student' : 'Course Name'}
                    </label>
                    <div className="relative group">
                      <select
                        value={newReportTargetId}
                        onChange={(e) => setNewReportTargetId(Number(e.target.value))}
                        className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#264796]/50 transition-all cursor-pointer hover:bg-white/10"
                      >
                        {newReportType === 'Student Report' ? (
                          availableStudents.length > 0 ? (
                            availableStudents.map(s => (
                              <option key={s.id} value={s.id} className="bg-[#1a1a1a]">
                                {s.name} - {s.registration_number || s.id}
                              </option>
                            ))
                          ) : (
                            <option value={0} disabled className="bg-[#1a1a1a]">No students found</option>
                          )
                        ) : (
                          availableCourses.length > 0 ? (
                            availableCourses.map(c => (
                              <option key={c.id} value={c.id} className="bg-[#1a1a1a]">
                                {c.name}
                              </option>
                            ))
                          ) : (
                            <option value={0} disabled className="bg-[#1a1a1a]">No courses found</option>
                          )
                        )}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                        <Users size={16} />
                      </div>
                    </div>
                    <p className="text-[10px] mt-2 text-gray-500 italic ml-1 flex items-center gap-1">
                      <RefreshCw size={10} className="animate-spin-slow" />
                      Tip: Selecting a {newReportType === 'Student Report' ? 'student' : 'course'} will generate the report for that specific entity.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => handleGenerate(newReportType, newReportTargetId)}
                  disabled={loading}
                  className="w-full h-14 bg-[#264796] hover:bg-[#1c3570] disabled:bg-[#1c3570] disabled:text-gray-400 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_10px_20px_-10px_rgba(38,71,150,0.5)] hover:shadow-[0_15px_30px_-10px_rgba(38,71,150,0.6)] group mt-4"
                >
                  {loading ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <>
                      <FileSpreadsheet size={20} className="group-hover:scale-110 transition-transform" />
                      Start Real-Time Generation
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="h-1 w-full bg-gradient-to-r from-[#264796] via-[#d0ae61] to-[#264796]" />
          </div>
        </div>
      )}

      {isSendModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div
            className="bg-[#121212] rounded-2xl max-w-md w-full overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 pt-8 pb-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white font-display mb-1">Send Report</h2>
                  <p className="text-gray-400 text-sm">Email this report directly to recipients.</p>
                </div>
                <button
                  onClick={() => setIsSendModalOpen(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#d0ae61] mb-2 ml-1">Recipient Email</label>
                  <div className="relative group">
                    <input
                      type="email"
                      value={sendEmailAddress}
                      onChange={(e) => setSendEmailAddress(e.target.value)}
                      placeholder="parent@school.com"
                      className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#264796]/50 transition-all hover:bg-white/10 placeholder:text-gray-600"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <Send size={16} />
                    </div>
                  </div>
                </div>

                <button
                  onClick={confirmSend}
                  disabled={loading}
                  className="w-full h-14 bg-[#264796] hover:bg-[#1c3570] disabled:bg-[#1c3570] disabled:text-gray-400 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_10px_20px_-10px_rgba(38,71,150,0.5)] hover:shadow-[0_15px_30px_-10px_rgba(38,71,150,0.6)] group mt-4"
                >
                  {loading ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      Send to Recipient
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="h-1 w-full bg-gradient-to-r from-[#264796] via-[#d0ae61] to-[#264796]" />
          </div>
        </div>
      )}
      {isViewModalOpen && viewingReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
          <div
            className="bg-[#0f0f0f] rounded-3xl max-w-4xl w-full h-[85vh] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div>
                <h2 className="text-xl font-bold text-white font-display mb-1">{viewingReport.name}</h2>
                <p className="text-gray-400 text-xs uppercase tracking-widest">{viewingReport.type} • Generated on {viewingReport.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownload(viewingReport)}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/5"
                  title="Download TXT"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 md:p-12 text-gray-300 leading-relaxed font-serif text-lg selection:bg-blue-500/30">
              <div className="max-w-2xl mx-auto space-y-6">
                {viewingReport.content?.split('\n').map((line: string, i: number) => {
                  if (!line.trim()) return <div key={i} className="h-4" />;

                  // Handle bold headers/sections
                  const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>');
                  return (
                    <p key={i} dangerouslySetInnerHTML={{ __html: formattedLine }} />
                  );
                })}
              </div>
            </div>

            <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-4">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="px-6 py-2.5 rounded-xl text-gray-400 hover:text-white font-bold transition-all"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setIsViewModalOpen(false);
                  handleSendClick(viewingReport);
                }}
                className="px-8 py-2.5 bg-[#264796] hover:bg-[#1c3570] text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg"
              >
                <Send size={16} /> Send via Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Report Modal: uses the fixed docs/report template.docx on the backend */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#121212] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="px-8 pt-8 pb-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white font-display">Event Reports</h2>
                  <p className="text-gray-400 text-sm mt-1">Create the CHRIST activity report from meeting or event notes.</p>
                </div>
                <button onClick={resetTemplateModal} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-gray-400 hover:text-white"><X size={20} /></button>
              </div>

              {manualStep !== 'generated' && <>
                <textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} rows={12} placeholder="Paste the meeting/event notes here. Include the activity type, title, date, time, venue, guests, participants, highlights, takeaways, feedback, and follow-up details when available." className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-2">Optional student/course context</label>
                  <select value={templateTargetId ?? ''} onChange={(e) => setTemplateTargetId(e.target.value ? Number(e.target.value) : undefined)} className="w-full h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-white">
                    <option value="" className="bg-[#1a1a1a]">None</option>
                    {availableStudents.map(s => <option key={`event-s-${s.id}`} value={s.id} className="bg-[#1a1a1a]">{s.name} - {s.registration_number || s.id}</option>)}
                  </select>
                </div>
              </>}

              {manualStep === 'generated' && <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 space-y-3">
                <div className="flex items-center gap-2 text-green-400 font-semibold"><CheckCircle size={20} /> Event report generated</div>
                {requiredFields.length > 0 ? <p className="text-sm text-amber-200">These items were not available in the notes and should be completed manually in the downloaded report: {requiredFields.join(', ')}.</p> : <p className="text-sm text-gray-300">All detected report fields were populated from the notes.</p>}
                <button onClick={() => handleDownload({ id: manualResult?.report_id, name: 'Event Report', type: 'Event Report' })} className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Download size={16} /> Download Activity Report</button>
              </div>}

              {templateError && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"><AlertTriangle size={16} />{templateError}</div>}
              <button onClick={manualStep === 'generated' ? resetTemplateModal : handleEventReportGenerate} disabled={loading || (manualStep !== 'generated' && !meetingNotes.trim())} className="w-full h-12 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:text-gray-400 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                {loading ? <RefreshCw size={18} className="animate-spin" /> : manualStep === 'generated' ? 'Finish' : <><FileText size={18} /> Generate Event Report</>}
              </button>
            </div>
            <div className="h-1 w-full bg-gradient-to-r from-purple-600 via-[#d0ae61] to-purple-600" />
          </div>
        </div>
      )}

      {/* Legacy uploaded-template modal retained for the older endpoint but not shown in the Event Reports UI. */}
      {false && isTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div
            className="bg-[#121212] rounded-2xl max-w-lg w-full overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 pt-8 pb-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white font-display mb-1">
                    {manualStep === 'upload' ? 'Upload Report Template' : manualStep === 'review' ? 'Confirm Report Fields' : 'Review Generated Report'}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {manualStep === 'upload' ? 'Upload the editable DOCX, then scan its required fields.' : manualStep === 'review' ? 'Edit detected values before generating the DOCX.' : 'The report is ready for review and download.'}
                  </p>
                </div>
                <button
                  onClick={resetTemplateModal}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {manualStep === 'upload' && <>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-2 ml-1">Report Template (DOCX)</label>
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${isDragging
                      ? 'border-purple-400 bg-purple-400/10'
                      : templateFile
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".docx"
                      className="hidden"
                      onChange={(e) => handleTemplateFileChange(e.target.files?.[0] || null)}
                    />
                    {templateFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle size={32} className="text-green-400" />
                        <p className="text-white font-semibold text-sm">{templateFile?.name}</p>
                        <p className="text-gray-500 text-xs">{((templateFile?.size || 0) / 1024).toFixed(1)} KB</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); setTemplateFile(null); }}
                          className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                          <Upload size={24} className="text-purple-400" />
                        </div>
                        <div>
                          <p className="text-white font-semibold text-sm">Drop your template here or click to browse</p>
                          <p className="text-gray-500 text-xs mt-1">Only .docx files accepted to preserve formatting</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Optional target selector */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-2 ml-1">Target Student / Course (Optional)</label>
                  <div className="relative group">
                    <select
                      value={templateTargetId ?? ''}
                      onChange={(e) => setTemplateTargetId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all cursor-pointer hover:bg-white/10"
                    >
                      <option value="" className="bg-[#1a1a1a]">— None (generic report) —</option>
                      <optgroup label="Students">
                        {availableStudents.map(s => (
                          <option key={`s-${s.id}`} value={s.id} className="bg-[#1a1a1a]">
                            {s.name} - {s.registration_number || s.id}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Courses">
                        {availableCourses.map(c => (
                          <option key={`c-${c.id}`} value={c.id} className="bg-[#1a1a1a]">
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <Users size={16} />
                    </div>
                  </div>
                  <p className="text-[10px] mt-2 text-gray-500 italic ml-1">
                    Select a student or course to auto-fill their data into the template.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-2 ml-1">Meeting notes (optional)</label>
                  <textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} rows={3} placeholder="Add notes for the report summary..." className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                </>}

                {manualStep === 'review' && <div className="space-y-4 max-h-[48vh] overflow-y-auto pr-1">
                  {detectedFields.length === 0 && <p className="text-gray-400 text-sm">No standard fields were detected. You can still add meeting notes and generate the report.</p>}
                  {detectedFields.map((field) => (
                    <label key={field} className="block">
                      <span className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-2">{field.replace(/_/g, ' ')}</span>
                      <input value={fieldOverrides[field] || ''} onChange={(e) => { setFieldOverrides(prev => ({ ...prev, [field]: e.target.value })); setRequiredFields(prev => prev.filter(item => item !== field || !!e.target.value.trim())); }} className="w-full h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                      {requiredFields.includes(field) && <span className="block mt-1 text-xs text-amber-300">Needs teacher input; it could not be inferred safely.</span>}
                    </label>
                  ))}
                  <label className="block">
                    <span className="block text-xs font-bold uppercase tracking-widest text-purple-400 mb-2">Meeting notes</span>
                    <textarea value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} rows={4} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                  </label>
                </div>}

                {manualStep === 'generated' && <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-green-400 font-semibold"><CheckCircle size={20} /> Manual report generated</div>
                  <p className="text-sm text-gray-300">Review the report in the recent reports list, or download the DOCX now.</p>
                  {requiredFields.length > 0 && <p className="text-xs text-amber-200">Fill these fields in the downloaded template before sharing: {requiredFields.join(', ')}.</p>}
                  <button onClick={() => handleDownload({ id: manualResult?.report_id, name: 'Manual Report', type: 'Template Report' })} className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"><Download size={16} /> Download DOCX</button>
                </div>}

                {/* Error display */}
                {templateError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                    <AlertTriangle size={16} />
                    {templateError}
                  </div>
                )}

                <button
                  onClick={manualStep === 'upload' ? handleTemplateScan : manualStep === 'review' ? handleTemplateGenerate : resetTemplateModal}
                  disabled={loading || (manualStep !== 'generated' && !templateFile)}
                  className="w-full h-14 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:text-gray-400 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all duration-300 shadow-[0_10px_20px_-10px_rgba(147,51,234,0.5)] hover:shadow-[0_15px_30px_-10px_rgba(147,51,234,0.6)] group mt-2"
                >
                  {loading ? (
                    <RefreshCw size={20} className="animate-spin" />
                  ) : (
                    <>
                      <FileText size={20} className="group-hover:scale-110 transition-transform" />
                      {manualStep === 'upload' ? 'Scan Template Fields' : manualStep === 'review' ? 'Generate Manual DOCX' : 'Finish Review'}
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="h-1 w-full bg-gradient-to-r from-purple-600 via-[#d0ae61] to-purple-600" />
          </div>
        </div>
      )}
    </div>
  );
};
