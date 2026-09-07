import React, { useState, useEffect } from "react";
import { 
  Mail, 
  Search, 
  Filter, 
  Send, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Info,
  History,
  Eraser,
  Plus,
  Trash2,
  Database,
  FileSpreadsheet,
  Save,
  X
} from "lucide-react";

import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { useAuthStore } from "../../store/useAuthStore";

const API_BASE_URL = API_ENDPOINTS.BASE;

interface Student {
  id: number;
  name: string;
  email: string;
  registration_number: string;
  attendance: number;
  avg_score: number;
}

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: any;
}

interface MailDraft {
  id: number;
  subject: string;
  body: string;
  student_ids?: number[];
  conditions?: any[];
}

interface MailHistory {
  id: number;
  subject: string;
  body: string;
  sent_at: string;
  recipient_count: number;
  recipients: any[];
}

const FIELDS = [
  { value: "attendance", label: "Attendance (%)", type: "number" },
  { value: "avg_score", label: "Average Marks (%)", type: "number" },
  { value: "name", label: "Student Name", type: "text" },
  { value: "registration_number", label: "Register Number", type: "text" },
];

const OPERATORS = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equal to" },
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
  { value: ">=", label: "greater than or equal" },
  { value: "<=", label: "less than or equal" },
  { value: "contains", label: "contains" },
];

export const MailStudentsPage: React.FC = () => {
  const authUser = useAuthStore((state) => state.user);
  const [students, setStudents] = useState<Student[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([
    { id: Math.random().toString(36).substr(2, 9), field: "attendance", operator: "<", value: 75 }
  ]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingMail, setGeneratingMail] = useState(false);
  
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [senderEmail, setSenderEmail] = useState(() => localStorage.getItem("teacher_sender_email") || "");
  const [sendMode, setSendMode] = useState<"gmail" | "smtp">("gmail");
  const [gmailProgress, setGmailProgress] = useState<{ current: number; total: number } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Drafts & History state
  const [drafts, setDrafts] = useState<MailDraft[]>([]);
  const [history, setHistory] = useState<MailHistory[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<MailHistory | null>(null);
  const [showDraftSelectionPopup, setShowDraftSelectionPopup] = useState(false);
  const [draftsToSend, setDraftsToSend] = useState<number[]>([]);

  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Temporary Data state
  const [dataSource, setDataSource] = useState<"platform" | "upload">("platform");
  const [uploadedData, setUploadedData] = useState<Student[]>([]);

  useEffect(() => {
    fetchDrafts();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!senderEmail && authUser?.email) setSenderEmail(authUser.email);
  }, [authUser?.email, senderEmail]);

  useEffect(() => {
    if (senderEmail) localStorage.setItem("teacher_sender_email", senderEmail);
  }, [senderEmail]);

  const fetchDrafts = async () => {
    try {
        const res = await fetch(`${API_ENDPOINTS.MAIL}/drafts`);
        const data = await res.json();
        setDrafts(data);
    } catch (err) {}
  };

  const fetchHistory = async () => {
    try {
        const res = await fetch(`${API_ENDPOINTS.MAIL}/history`);
        const data = await res.json();
        setHistory(data);
    } catch (err) {}
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setPendingFile(file);
    const formData = new FormData();
    formData.append("file", file);
    
    setLoading(true);
    setStatus(null);
    try {
        const res = await fetch(`${API_ENDPOINTS.MAIL}/preview_upload`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            setPreviewData(data.preview);
            setTotalRecords(data.total_records);
            setShowPreviewModal(true);
        } else {
            setStatus({ type: 'error', message: data.detail || "Failed to parse file for preview" });
            setPendingFile(null);
        }
    } catch (err) {
        setStatus({ type: 'error', message: "Error reading file" });
        setPendingFile(null);
    } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    
    const formData = new FormData();
    formData.append("file", pendingFile);
    
    setLoading(true);
    setStatus(null);
    setShowPreviewModal(false);
    
    try {
        const res = await fetch(`${API_ENDPOINTS.MAIL}/upload_students`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            setStatus({ type: 'success', message: "Students imported temporarily for this session." });
            setUploadedData(data.data);
            setDataSource("upload");
            setStudents([]); 
            setSelectedStudents([]);
            setUploadedFileName(pendingFile.name);
        } else {
            setStatus({ type: 'error', message: data.detail || "Failed to upload students" });
        }
    } catch (err) {
        setStatus({ type: 'error', message: "Error uploading file" });
    } finally {
        setLoading(false);
        setPendingFile(null);
    }
  };

  const addCondition = () => {
    setConditions([...conditions, { 
      id: Math.random().toString(36).substr(2, 9), 
      field: "attendance", 
      operator: ">=", 
      value: 0 
    }]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter(c => c.id !== id));
    }
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const filterStudents = async () => {
    setLoading(true);
    setStatus(null);
    try {
      if (dataSource === "upload") {
        const result = uploadedData.filter(s => {
            for (const cond of conditions) {
                let val: any = (s as any)[cond.field];
                let cmp: any = cond.value;
                if (cond.field === 'attendance' || cond.field === 'avg_score') {
                    cmp = typeof cmp === 'string' ? parseFloat(cmp) : cmp;
                }
                
                if (cond.operator === '==') { if (val != cmp) return false; }
                else if (cond.operator === '!=') { if (val == cmp) return false; }
                else if (cond.operator === '>') { if (val <= cmp) return false; }
                else if (cond.operator === '<') { if (val >= cmp) return false; }
                else if (cond.operator === '>=') { if (val < cmp) return false; }
                else if (cond.operator === '<=') { if (val > cmp) return false; }
                else if (cond.operator === 'contains') { 
                    if (!String(val).toLowerCase().includes(String(cmp).toLowerCase())) return false; 
                }
            }
            return true;
        });
        setStudents(result);
        setSelectedStudents(result.map(s => s.id));
      } else {
        const apiConditions = conditions.map(c => ({
          field: c.field,
          operator: c.operator,
          value: c.field === 'attendance' || c.field === 'avg_score'
            ? (typeof c.value === 'string' ? parseInt(c.value) : c.value)
            : c.value
        }));

        const res = await fetch(`${API_ENDPOINTS.MAIL}/filter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conditions: apiConditions })
        });
        const data = await res.json();
        setStudents(data);
        setSelectedStudents(data.map((s: Student) => s.id));
      }
    } catch (err) {
        setStatus({ type: 'error', message: "Failed to filter students" });
    } finally {
      setLoading(false);
    }
  };

  const filterStudentsWithConditions = async (apiConditions: any[], selectIds: number[] = []) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.MAIL}/filter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: apiConditions })
      });
      const data = await res.json();
      setStudents(data);
      if (selectIds && selectIds.length > 0) {
          setSelectedStudents(selectIds);
      } else {
          setSelectedStudents(data.map((s: Student) => s.id));
      }
    } catch (err) {
      setStatus({ type: 'error', message: "Failed to load draft students" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!mailSubject || !mailBody) {
        setStatus({ type: 'error', message: "Subject and body are required to save draft" });
        return;
    }
    try {
        let res;
        const payload = { 
            subject: mailSubject, 
            body: mailBody,
            student_ids: selectedStudents,
            conditions: conditions
        };
        if (selectedDraftId) {
             res = await fetch(`${API_ENDPOINTS.MAIL}/drafts/${selectedDraftId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
             res = await fetch(`${API_ENDPOINTS.MAIL}/drafts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }
        
        if (res.ok) {
            const data = await res.json();
            setStatus({ type: 'success', message: "Draft saved successfully" });
            setSelectedDraftId(data.id);
            fetchDrafts();
        }
    } catch (err) {
        setStatus({ type: 'error', message: "Failed to save draft" });
    }
  };

  const handleSendMailClick = () => {
    if (selectedStudents.length === 0) {
      setStatus({ type: 'error', message: "Please select at least one student" });
      return;
    }
    setShowDraftSelectionPopup(true);
    // Pre-select the current draft if we are viewing one
    if (selectedDraftId && !draftsToSend.includes(selectedDraftId)) {
        setDraftsToSend([selectedDraftId]);
    }
  };

  const handleGenerateMail = async () => {
    const sourceStudents = dataSource === 'upload' ? uploadedData : students;
    const selected = sourceStudents.filter(student => selectedStudents.includes(student.id));
    if (!selected.length) {
      setStatus({ type: 'error', message: "Run the query and select at least one student first." });
      return;
    }
    setGeneratingMail(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.MAIL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditions,
          students: selected.map(student => ({
            id: student.id,
            name: student.name,
            email: student.email,
            registration_number: student.registration_number,
            attendance: student.attendance,
            avg_score: student.avg_score,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Groq could not generate the mail");
      setMailSubject(data.subject);
      setMailBody(data.body);
      setStatus({ type: 'success', message: "Groq generated the subject and message body. Review them before opening Gmail." });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : "Mail generation failed" });
    } finally {
      setGeneratingMail(false);
    }
  };

  const openGmailComposes = async () => {
    if (!senderEmail.trim()) {
      setStatus({ type: 'error', message: "Enter your sender email address first." });
      return;
    }
    const sourceStudents = dataSource === 'upload' ? uploadedData : students;
    const selectedRecords = sourceStudents
      .filter(student => selectedStudents.includes(student.id) && student.email?.trim())
    if (!selectedRecords.length) {
      setStatus({ type: 'error', message: "Selected students do not have email addresses." });
      return;
    }

    const mailItems = draftsToSend.length > 0
      ? drafts.filter(draft => draftsToSend.includes(draft.id)).map(draft => ({ subject: draft.subject || "", body: draft.body || "" }))
      : [{ subject: mailSubject, body: mailBody }];
    if (mailItems.some(item => !item.subject || !item.body)) {
      setStatus({ type: 'error', message: "Subject and body are required to open Gmail." });
      return;
    }

    const personalize = (text: string, student: Student) => text
      .replace(/\{\{?\s*name\s*\}?\}/gi, student.name || "")
      .replace(/\{\{?\s*reg(?:istration)?(?:_num|_number| number|_no)?\s*\}?\}/gi, student.registration_number || "")
      .replace(/\{\{?\s*attendance\s*\}?\}/gi, `${student.attendance ?? ""}`)
      .replace(/\{\{?\s*(?:marks|avg_score)\s*\}?\}/gi, `${student.avg_score ?? ""}`);
    const hasPersonalization = mailItems.some(item => /\{\{?\s*(?:name|reg|registration|attendance|marks|avg_score)\b[^}]*\}?\}/i.test(`${item.subject} ${item.body}`));
    const recipients = selectedRecords.map(student => student.email.trim());
    const batches: Array<{ subject: string; body: string; recipients: string[] }> = [];
    for (const item of mailItems) {
      if (hasPersonalization) {
        selectedRecords.forEach(student => batches.push({
          subject: personalize(item.subject, student),
          body: personalize(item.body, student),
          recipients: [student.email.trim()],
        }));
        continue;
      }
      let current: string[] = [];
      for (const recipient of recipients) {
        const candidate = [...current, recipient];
        const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(candidate.join(","))}&su=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.body)}`;
        if (current.length && url.length > 1800) {
          batches.push({ ...item, recipients: current });
          current = [recipient];
        } else {
          current = candidate;
        }
      }
      if (current.length) batches.push({ ...item, recipients: current });
    }

    setGmailProgress({ current: 0, total: batches.length });
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(batch.recipients.join(","))}&su=${encodeURIComponent(batch.subject)}&body=${encodeURIComponent(batch.body)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      await fetch(`${API_ENDPOINTS.MAIL}/log-gmail-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: batch.subject, body: batch.body, recipients: batch.recipients, sender_email: senderEmail }),
      });
      setGmailProgress({ current: index + 1, total: batches.length });
      if (index < batches.length - 1) await new Promise(resolve => setTimeout(resolve, 350));
    }
    setStatus({ type: 'success', message: `Opened ${batches.length} Gmail compose window${batches.length === 1 ? "" : "s"}.` });
    fetchHistory();
    setGmailProgress(null);
    setDraftsToSend([]);
  };

  const executeSendMails = async () => {
    setShowDraftSelectionPopup(false);
    setSending(true);
    try {
      if (sendMode === "gmail") {
        await openGmailComposes();
        return;
      }
      const payload: any = {};
      
      if (dataSource === 'upload') {
          payload.temporary_students = students.filter(s => selectedStudents.includes(s.id));
      } else {
          payload.student_ids = selectedStudents;
      }
      
      if (draftsToSend.length > 0) {
          payload.draft_ids = draftsToSend;
      } else {
          if (!mailSubject || !mailBody) {
             setStatus({ type: 'error', message: "Please compose a mail or select drafts to send." });
             setSending(false);
             return;
          }
          payload.subject = mailSubject;
          payload.body = mailBody;
      }
      
      const res = await fetch(`${API_ENDPOINTS.MAIL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
          setStatus({ type: 'success', message: data.message });
          fetchHistory();
          fetchDrafts();
          
          // If the currently selected draft was sent, or we sent the current composition, reset the form
          if (draftsToSend.includes(selectedDraftId as number) || draftsToSend.length === 0) {
              setSelectedDraftId(null);
              setMailSubject("");
              setMailBody("");
          }
      } else {
          setStatus({ type: 'error', message: data.detail || "Failed to send emails" });
      }
    } catch (err) {
      setStatus({ type: 'error', message: "Failed to send emails" });
    } finally {
      setSending(false);
      setDraftsToSend([]);
    }
  };

  const handleDiscard = async () => {
      if (selectedDraftId) {
          try {
              await fetch(`${API_ENDPOINTS.MAIL}/drafts/${selectedDraftId}`, { method: "DELETE" });
              fetchDrafts();
          } catch (e) {}
      }
      setSelectedDraftId(null);
      setMailSubject("");
      setMailBody("");
      setConditions([{ id: Math.random().toString(36).substr(2, 9), field: "attendance", operator: "<", value: 75 }]);
      setStudents([]);
      setSelectedStudents([]);
      setStatus({ type: 'success', message: "Mail discarded" });
  };

  const toggleStudentSelection = (id: number) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleQuickFilter = (type: string) => {
    if (type === 'low-attendance') {
      setConditions([{ id: '1', field: "attendance", operator: "<", value: 75 }]);
    } else if (type === 'borderline') {
      setConditions([
        { id: '1', field: "attendance", operator: ">=", value: 75 },
        { id: '2', field: "attendance", operator: "<=", value: 85 }
      ]);
    } else if (type === 'high-performers') {
      setConditions([{ id: '1', field: "avg_score", operator: ">", value: 85 }]);
    }
  };

  return (
    <div className="mx-auto space-y-6 animate-fade-in pb-20 px-2 lg:px-0 max-w-7xl">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Mailing System</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>Communicate with students based on SQL-like performance queries.</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex bg-white/50 backdrop-blur-sm rounded-xl p-1 border shadow-sm" style={{ borderColor: "var(--color-border)" }}>
              <button
                onClick={() => { setDataSource("platform"); setStudents([]); setSelectedStudents([]); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dataSource === "platform" 
                    ? "bg-brand-blue text-white shadow-md" 
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Platform
              </button>
              <button
                onClick={() => { 
                    if (uploadedData.length === 0) {
                        setStatus({ type: 'error', message: "Please upload data first." });
                        return;
                    }
                    setDataSource("upload"); 
                    setStudents([]); 
                    setSelectedStudents([]);
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dataSource === "upload" 
                    ? "bg-green-600 text-white shadow-md" 
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                Uploads
              </button>
            </div>
            
            {uploadedFileName ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-green-50 text-green-700 relative overflow-hidden transition-colors" style={{ borderColor: "var(--color-border)" }}>
                    <FileSpreadsheet size={18} className="text-green-600" />
                    <span className="text-xs font-bold truncate max-w-[150px]">{uploadedFileName}</span>
                    <button 
                        onClick={() => {
                            setUploadedFileName(null);
                            setUploadedData([]);
                            setDataSource("platform");
                            setStudents([]);
                            setSelectedStudents([]);
                        }}
                        className="p-1 hover:bg-green-200 rounded-full transition-colors ml-1 text-green-800"
                        title="Remove file and switch back to Platform data"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white/50 backdrop-blur-sm relative overflow-hidden group hover:bg-green-50 transition-colors" style={{ borderColor: "var(--color-border)" }}>
                    <input type="file" accept=".csv,.xlsx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    <FileSpreadsheet size={18} className="text-green-600" />
                    <span className="text-xs font-bold text-green-700 group-hover:text-green-800 transition-colors">Upload Data (CSV/XLSX)</span>
                </div>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: SQL Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 rounded-2xl border shadow-sm space-y-5" style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-2 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
              <Database size={20} className="text-brand-blue" />
              <h2 className="font-bold uppercase text-xs tracking-widest" style={{ color: "var(--color-text-muted)" }}>Query Builder</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-tighter text-blue-600">SELECT</span>
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[10px] font-bold border border-blue-100">STUDENTS</span>
              </div>
              
              <div className="flex items-center gap-2 -mt-2">
                <span className="text-xs font-black uppercase tracking-tighter text-blue-600">WHERE</span>
              </div>

              <div className="space-y-3">
                {conditions.map((cond, idx) => (
                  <div key={cond.id} className="relative group p-4 rounded-xl border bg-gray-50/50 hover:bg-white transition-all hover:shadow-md" style={{ borderColor: "var(--color-border)" }}>
                    {idx > 0 && (
                       <div className="absolute -top-3 left-4 px-2 py-0.5 bg-white border rounded-full text-[9px] font-black text-blue-600 uppercase" style={{ borderColor: "var(--color-border)" }}>
                        AND
                       </div>
                    )}
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">Column</label>
                        <select 
                          className="w-full text-xs font-semibold p-2 rounded-lg border bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                          value={cond.field}
                        onChange={(e) => updateCondition(cond.id, { field: e.target.value, value: FIELDS.find(f => f.value === e.target.value)?.type === 'number' ? 0 : "" })}
                        >
                          {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">Operator</label>
                          <select 
                            className="w-full text-xs font-semibold p-2 rounded-lg border bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                            value={cond.operator}
                            onChange={(e) => updateCondition(cond.id, { operator: e.target.value })}
                          >
                            {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase mb-1 block">Value</label>
                          <input
                              type={FIELDS.find(f => f.value === cond.field)?.type || "text"}
                              className="w-full text-xs font-semibold p-2 rounded-lg border bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                              value={cond.value}
                              onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                            />
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => removeCondition(cond.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-50 text-red-500 rounded-full border border-red-100 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={addCondition}
                className="w-full py-2 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
                style={{ borderColor: "var(--color-border)" }}
              >
                <Plus size={14} /> Add Condition
              </button>
            </div>

            <div className="pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--color-text-muted)" }}>Quick Presets</p>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => handleQuickFilter('low-attendance')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border hover:border-red-400 transition-colors"
                  style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
                >
                  Critical Att. (&lt;75%)
                </button>
                <button 
                  onClick={() => handleQuickFilter('borderline')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border hover:border-orange-400 transition-colors"
                  style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
                >
                  Borderline (75-85%)
                </button>
                <button 
                  onClick={() => handleQuickFilter('high-performers')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border hover:border-green-400 transition-colors"
                  style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
                >
                  Toppers (&gt;85%)
                </button>
              </div>
            </div>

            <button 
              onClick={filterStudents}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-blue text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {loading ? "Executing Query..." : <><Search size={18} /> Execute Search</>}
            </button>
          </div>
        </div>

        {/* Center Column: List & Compose */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Message */}
          {status && (
            <div className={`p-4 rounded-xl flex items-center gap-3 border animate-in fade-in slide-in-from-top-2 duration-300 ${
              status.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-red-500/10 border-red-500/20 text-red-600'
            }`}>
              {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-semibold">{status.message}</span>
            </div>
          )}

          {/* Student List Section */}
          <div className="p-6 rounded-2xl border shadow-sm" style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-brand-blue" />
                <h2 className="font-bold">Result Set ({students.length})</h2>
              </div>
              {students.length > 0 && (
                <div className="flex items-center gap-4">
                   <button 
                    onClick={() => setSelectedStudents([])}
                    className="text-xs font-bold text-red-500 flex items-center gap-1 hover:underline"
                   >
                    <Eraser size={14} /> Clear Selection
                   </button>
                   <button 
                    onClick={() => setSelectedStudents(students.map(s => s.id))}
                    className="text-xs font-bold text-blue-500 flex items-center gap-1 hover:underline"
                   >
                    <CheckCircle2 size={14} /> Select All
                   </button>
                </div>
              )}
            </div>

            <div className="max-h-[300px] overflow-y-auto border rounded-xl" style={{ borderColor: "var(--color-border)" }}>
              {students.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10" style={{ background: "var(--color-surface-base)" }}>
                    <tr className="border-b" style={{ borderColor: "var(--color-border)" }}>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Select</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Student Name</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Email</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Att.</th>
                      <th className="p-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {students.map(s => (
                      <tr 
                        key={s.id} 
                        className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${selectedStudents.includes(s.id) ? 'bg-blue-50/30' : ''}`}
                        onClick={() => toggleStudentSelection(s.id)}
                      >
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedStudents.includes(s.id)} 
                            onChange={() => {}} 
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                          />
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-semibold">{s.name}</p>
                          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{s.registration_number}</p>
                        </td>
                        <td className="p-4 text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>{s.email}</td>
                        <td className="p-4">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.attendance < 75 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {s.attendance}%
                          </span>
                        </td>
                        <td className="p-4">
                           <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.avg_score < 40 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {s.avg_score}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed" style={{ borderColor: "var(--color-border)" }}>
                    <Search size={24} className="text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>No students found</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Define your query conditions and click execute.</p>
                </div>
              )}
            </div>
            
            <div className="mt-4 flex items-center justify-between text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              <span>Showing {students.length} students</span>
              <span className="font-bold text-blue-600">{selectedStudents.length} students selected</span>
            </div>
          </div>

          {/* Compose Section */}
          <div className="p-6 rounded-2xl border shadow-sm space-y-6" style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center gap-2">
                  <Mail size={20} className="text-brand-blue" />
                  <h2 className="font-bold">Compose Message</h2>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg border bg-white/50 backdrop-blur-sm" style={{ borderColor: "var(--color-border)" }}>
                    <Info size={14} className="text-blue-500" />
                    <span className="text-[10px] font-medium" style={{ color: "var(--color-text-secondary)" }}>Use {"{{name}}"} to personalize</span>
                </div>
              </div>
              
              {/* Drafts Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button 
                    onClick={() => { 
                        setSelectedDraftId(null); 
                        setMailSubject(""); 
                        setMailBody(""); 
                        setConditions([{ id: Math.random().toString(36).substr(2, 9), field: "attendance", operator: "<", value: 75 }]);
                        setStudents([]);
                        setSelectedStudents([]);
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap shadow-sm border ${!selectedDraftId ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}
                >
                    <div className="flex items-center gap-1"><Plus size={14}/> New Mail</div>
                </button>
                {drafts.map(d => (
                  <button 
                      key={d.id}
                      onClick={() => { 
                          setSelectedDraftId(d.id); 
                          setMailSubject(d.subject); 
                          setMailBody(d.body); 
                          if (d.conditions && d.conditions.length > 0) {
                              setConditions(d.conditions);
                              const apiConds = d.conditions.map((c: any) => ({ field: c.field, operator: c.operator, value: c.value }));
                              filterStudentsWithConditions(apiConds, d.student_ids || []);
                          } else {
                              if (d.student_ids) {
                                  setSelectedStudents(d.student_ids);
                              }
                          }
                      }}
                      className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap shadow-sm border max-w-[200px] truncate ${selectedDraftId === d.id ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}
                  >
                      {d.subject || "Untitled Draft"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Sender Email</label>
                <input
                  type="email"
                  placeholder={authUser?.email || "teacher@christuniversity.in"}
                  className="w-full p-3 rounded-xl border bg-transparent focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  value={senderEmail}
                  onChange={e => setSenderEmail(e.target.value)}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--color-text-muted)" }}>Saved locally and used for Gmail action history.</p>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: "var(--color-border)" }}>
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--color-text-primary)" }}>Delivery method</p>
                  <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Gmail opens a compose window; SMTP sends through the backend.</p>
                </div>
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                  <button onClick={() => setSendMode("gmail")} className={`px-3 py-1.5 rounded-md text-[10px] font-bold ${sendMode === "gmail" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>Gmail (Recommended)</button>
                  <button onClick={() => setSendMode("smtp")} className={`px-3 py-1.5 rounded-md text-[10px] font-bold ${sendMode === "smtp" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>SMTP Fallback</button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Subject</label>
                  <button onClick={handleGenerateMail} disabled={generatingMail || selectedStudents.length === 0} className="text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-40">
                    {generatingMail ? "Generating..." : "Generate with Groq"}
                  </button>
                </div>
                <input 
                  type="text" 
                  placeholder="e.g., Attendance Warning / Appreciation Mail" 
                  className="w-full p-3 rounded-xl border bg-transparent focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                  value={mailSubject}
                  onChange={e => setMailSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Message Body</label>
                <div className="relative">
                  <textarea 
                    rows={8}
                    placeholder="Hello {{name}}, we noticed your attendance is {{attendance}}%..."
                    className="w-full p-4 rounded-xl border bg-transparent focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
                    value={mailBody}
                    onChange={e => setMailBody(e.target.value)}
                  />
                  <div className="absolute bottom-3 right-3 flex gap-2">
                     <button 
                      className="px-2 py-1 text-[9px] font-bold bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                      onClick={() => setMailBody(prev => prev + "{{name}}")}
                     >
                      + Name
                     </button>
                     <button 
                      className="px-2 py-1 text-[9px] font-bold bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                      onClick={() => setMailBody(prev => prev + "{{reg_num}}")}
                     >
                      + Reg No.
                     </button>
                     <button 
                      className="px-2 py-1 text-[9px] font-bold bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                      onClick={() => setMailBody(prev => prev + "{{attendance}}")}
                     >
                      + Attendance
                     </button>
                     <button 
                      className="px-2 py-1 text-[9px] font-bold bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                      onClick={() => setMailBody(prev => prev + "{{marks}}")}
                     >
                      + Marks
                     </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                  <button 
                    onClick={handleDiscard}
                    className="flex items-center gap-2 px-5 py-2.5 text-red-600 bg-red-50 rounded-xl font-bold hover:bg-red-100 transition-colors border border-red-100"
                  >
                     <Trash2 size={16} /> Discard
                  </button>
                  <button 
                    onClick={handleSaveDraft}
                    className="flex items-center gap-2 px-5 py-2.5 text-blue-600 bg-blue-50 rounded-xl font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                  >
                     <Save size={16} /> Save as Draft
                  </button>
              </div>
              
              <button 
                onClick={handleSendMailClick}
                disabled={sending || selectedStudents.length === 0}
                className="flex items-center gap-2 px-8 py-3 bg-brand-blue text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {sending ? "Sending..." : sendMode === "gmail" ? <><Mail size={18} /> Open in Gmail</> : <><Send size={18} /> Send via SMTP</>}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 rounded-2xl border shadow-sm flex flex-col h-full min-h-[500px]" style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-2 border-b pb-4 mb-4" style={{ borderColor: "var(--color-border)" }}>
               <History size={20} className="text-brand-blue" />
               <h2 className="font-bold uppercase text-xs tracking-widest" style={{ color: "var(--color-text-muted)" }}>Sent History</h2>
            </div>
            
            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
               {history.map(h => (
                  <div key={h.id} onClick={() => setSelectedHistory(h)} className="p-4 border rounded-xl hover:bg-gray-50 cursor-pointer transition-colors" style={{ borderColor: "var(--color-border)", background: "white" }}>
                     <p className="text-sm font-bold truncate text-gray-800">{h.subject}</p>
                     <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] font-semibold text-gray-400">{new Date(h.sent_at).toLocaleDateString()} {new Date(h.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-bold">{h.recipient_count} recipients</span>
                     </div>
                  </div>
               ))}
               {history.length === 0 && (
                  <div className="text-center py-10 opacity-50">
                    <History size={32} className="mx-auto mb-3 text-gray-400" />
                    <p className="text-xs font-bold text-gray-500">No emails sent yet.</p>
                  </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Popups */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col animate-fade-in border border-gray-100 max-h-[85vh]">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                <h3 className="text-xl font-bold flex items-center gap-2"><Database size={22} className="text-brand-blue"/> Dataset Preview</h3>
                <button onClick={() => { setShowPreviewModal(false); setPendingFile(null); }} className="p-1.5 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"><X size={18}/></button>
             </div>
             
             <div className="mb-4">
               <p className="text-sm font-semibold text-gray-600">Previewing first 10 records of {totalRecords} total records found in <span className="text-blue-600 font-bold">{pendingFile?.name}</span>.</p>
               <p className="text-xs text-orange-500 font-semibold mt-1">Please confirm this dataset looks correct before importing. Importing will replace your current dataset.</p>
             </div>

             <div className="flex-1 overflow-auto border rounded-xl custom-scrollbar" style={{ borderColor: "var(--color-border)" }}>
               <table className="w-full text-left border-collapse">
                 <thead className="sticky top-0 bg-gray-50 backdrop-blur-md z-10">
                   <tr className="border-b border-gray-200">
                     <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">Student Name</th>
                     <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">Email</th>
                     <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">Course</th>
                     <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">Att.</th>
                     <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">Marks</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100 bg-white">
                   {previewData.map((s, idx) => (
                     <tr key={idx} className="hover:bg-gray-50 transition-colors">
                       <td className="p-4">
                         <p className="text-sm font-semibold">{s.name}</p>
                         <p className="text-[10px] text-gray-500">{s.registration_number}</p>
                       </td>
                       <td className="p-4 text-xs font-mono text-gray-500">{s.email}</td>
                       <td className="p-4 text-xs font-semibold text-gray-600">{s.course_name}</td>
                       <td className="p-4">
                         <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.attendance < 75 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                           {s.attendance}%
                         </span>
                       </td>
                       <td className="p-4">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.avg_score < 40 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                           {s.avg_score}%
                         </span>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>

             <div className="flex gap-3 justify-end pt-5 mt-4 border-t border-gray-100">
                <button className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors" onClick={() => { setShowPreviewModal(false); setPendingFile(null); }}>Cancel</button>
                <button className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-green-600 text-white rounded-xl shadow-lg shadow-green-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all" onClick={confirmImport} disabled={loading}>
                    <Database size={16} /> {loading ? "Importing..." : "Confirm Import"}
                </button>
             </div>
          </div>
        </div>
      )}

      {gmailProgress && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl text-center">
            <Mail size={28} className="mx-auto mb-3 text-blue-600" />
            <p className="font-bold text-gray-800">Opening Gmail</p>
            <p className="text-sm text-gray-500 mt-1">Opening batch {gmailProgress.current + 1} of {gmailProgress.total}...</p>
          </div>
        </div>
      )}

      {showDraftSelectionPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-3xl w-full max-w-md shadow-2xl animate-fade-in border border-gray-100">
             <div className="flex justify-between items-center mb-5">
               <h3 className="text-xl font-bold text-gray-800">Select Mails to Send</h3>
               <button onClick={() => setShowDraftSelectionPopup(false)} className="p-1.5 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"><X size={18}/></button>
             </div>
             
             {drafts.length === 0 ? (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-6">
                    <p className="text-sm font-semibold text-blue-800">No saved drafts found.</p>
                    <p className="text-xs text-blue-600 mt-1">The currently composed mail will be sent to {selectedStudents.length} selected students.</p>
                </div>
             ) : (
               <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto pr-1">
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Available Drafts</p>
                 {drafts.map(d => (
                    <label key={d.id} className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${draftsToSend.includes(d.id) ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50 hover:border-gray-300'}`}>
                       <input 
                          type="checkbox" 
                          className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={draftsToSend.includes(d.id)} 
                          onChange={(e) => {
                             if (e.target.checked) setDraftsToSend([...draftsToSend, d.id]);
                             else setDraftsToSend(draftsToSend.filter(id => id !== d.id));
                          }} 
                       />
                       <div className="flex-1 min-w-0">
                         <p className={`font-bold text-sm truncate ${draftsToSend.includes(d.id) ? 'text-blue-900' : 'text-gray-800'}`}>{d.subject || "Untitled Draft"}</p>
                         <p className="text-xs text-gray-500 line-clamp-1 mt-1">{d.body}</p>
                       </div>
                    </label>
                 ))}
                 {!draftsToSend.length && (
                    <p className="text-xs text-orange-500 font-semibold mt-3 p-2 bg-orange-50 rounded-lg">If no drafts are selected, the currently composed mail will be sent.</p>
                 )}
               </div>
             )}
             
             <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors" onClick={() => setShowDraftSelectionPopup(false)}>Cancel</button>
                <button className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-brand-blue text-white rounded-xl shadow-lg shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all" onClick={executeSendMails}>
                    {sendMode === "gmail" ? <Mail size={16} /> : <Send size={16} />} {sendMode === "gmail" ? "Open Gmail" : "Confirm Send"}
                </button>
             </div>
          </div>
        </div>
      )}

      {selectedHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-3xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col animate-fade-in border border-gray-100">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                <h3 className="text-xl font-bold flex items-center gap-2"><Mail size={22} className="text-brand-blue"/> Sent Mail Details</h3>
                <button onClick={() => setSelectedHistory(null)} className="p-1.5 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"><X size={18}/></button>
             </div>
             
             <div className="space-y-6 overflow-y-auto flex-1 pr-2 custom-scrollbar">
               <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subject</p>
                      <p className="text-sm font-bold text-gray-800">{selectedHistory.subject}</p>
                   </div>
                   <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sent Timestamp</p>
                      <p className="text-sm font-bold text-gray-800">{new Date(selectedHistory.sent_at).toLocaleString()}</p>
                   </div>
               </div>
               
               <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Message Body</p>
                  <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                     {selectedHistory.body}
                  </div>
               </div>
               
               <div>
                  <div className="flex items-center justify-between mb-2 ml-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recipients List</p>
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-[10px] font-bold">{selectedHistory.recipient_count} Total</span>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto border border-gray-200 rounded-xl divide-y bg-white custom-scrollbar">
                     {selectedHistory.recipients.map((r: any, idx: number) => (
                        <div key={idx} className="p-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                           <div className="flex items-center gap-3">
                               <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                                   {r.name.charAt(0)}
                               </div>
                               <span className="font-semibold text-sm text-gray-800">{r.name}</span>
                           </div>
                           <span className="text-xs text-gray-500 font-mono">{r.email}</span>
                        </div>
                     ))}
                  </div>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
