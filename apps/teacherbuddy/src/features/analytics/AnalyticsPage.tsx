import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart3, TrendingUp, AlertTriangle, Users, Download,
  ChevronDown, Filter, RefreshCw, Activity, ArrowUp, ArrowDown,
  BrainCircuit, Eye, Info, Upload, FileSpreadsheet, Check, X,
  PieChart as PieChartIcon, LayoutDashboard, Database
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ComposedChart
} from 'recharts';

import { API_ENDPOINTS } from "../../shared/utils/apiConfig";
import { useAuthStore } from "../../store/useAuthStore";

const API_BASE = API_ENDPOINTS.BASE;

/* ─── Types ──────────────────────────────────────────── */
interface Course {
  id: number;
  name: string;
  code: string;
}

interface AnalyticsData {
  overview: {
    avg_score: string;
    total_students: number;
    at_risk_count: number;
    attendance_rate: string;
  };
  risk_students: any[];
  performance_trend: any[];
  subject_breakdown: any[];
  raw_data?: any[];
}

interface UploadedData {
  summary: {
    rows: number;
    columns: string[];
    avg_score: string;
    std_dev?: number;
    pass_rate?: string;
    high_score?: string;
    low_score?: string;
    avg_attendance?: number;
    attendance_column?: string;
    score_column?: string;
    scale?: number;
    missing_values?: number;
    impute_method?: string;
  };
  distribution: { grade: string; pct: number; count: number }[];
  risk_students: any[];
  student_points?: { name: string; roll: string; score: number }[];
  raw_data: any[];
}

/* ─── Components ─────────────────────────────────────── */

const RiskCell: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const safeValue = (value == null || isNaN(value)) ? 0 : Math.round(value);
  const color = safeValue >= 75 ? "#dc2626" : safeValue >= 50 ? "#d97706" : "#16a34a";
  const bg    = safeValue >= 75 ? "rgba(220,38,38,0.09)" : safeValue >= 50 ? "rgba(217,119,6,0.09)" : "rgba(22,163,74,0.09)";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-transform hover:scale-110 cursor-pointer"
        style={{ background: bg, color, border: `1.5px solid ${color}30` }}
        title={`${label}: ${safeValue}`}
      >
        {safeValue}
      </div>
      <span className="text-[9px] text-center leading-tight" style={{ color: "var(--color-text-muted)", maxWidth: 36 }}>{label}</span>
    </div>
  );
};

export const AnalyticsPage: React.FC = () => {
  const authUser = useAuthStore((state) => state.user);
  // 1. Determine if this is a reload and get persisted state immediately
  const persisted = useMemo(() => {
    const navEntries = performance.getEntriesByType("navigation");
    const isReload = navEntries.length > 0 && (navEntries[0] as PerformanceNavigationTiming).type === 'reload';
    if (!isReload) return null;
    
    const saved = sessionStorage.getItem("teacher_analytics_cache");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }, []);

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(persisted?.selectedCourseId || null);
  const [dataSource, setDataSource] = useState<"platform" | "upload">(persisted?.dataSource || "platform");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(persisted?.analytics || null);
  const [uploadedData, setUploadedData] = useState<UploadedData | null>(persisted?.uploadedData || null);
  
  const [activeTab, setActiveTab] = useState<"overview" | "risk" | "subjects" | "raw">(persisted?.activeTab || "overview");
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imputeMethod = "blank";
  const [fileName, setFileName] = useState(persisted?.fileName || "");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastFetchedCourseId = useRef<number | null>(persisted?.dataSource === "platform" ? persisted?.selectedCourseId : null);

  // Persistence logic: Clear storage if this is a fresh navigation (not a reload)
  useEffect(() => {
    const navEntries = performance.getEntriesByType("navigation");
    const isReload = navEntries.length > 0 && (navEntries[0] as PerformanceNavigationTiming).type === 'reload';
    
    if (!isReload) {
      sessionStorage.removeItem("teacher_analytics_cache");
    }
  }, []);

  // Sync state to sessionStorage whenever it changes
  useEffect(() => {
    const state = { analytics, uploadedData, dataSource, selectedCourseId, activeTab, fileName };
    sessionStorage.setItem("teacher_analytics_cache", JSON.stringify(state));
  }, [analytics, uploadedData, dataSource, selectedCourseId, activeTab, fileName]);

  // Fetch courses on mount
  useEffect(() => {
    fetch(`${API_BASE}/courses/`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch courses");
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setCourses(data);
          // Only set default if we don't have a persisted selection
          if (data.length > 0 && !selectedCourseId) {
            setSelectedCourseId(data[0].id);
          }
        } else {
          setCourses([]);
        }
      })
      .catch(err => {
        console.error("Error fetching courses:", err);
        setCourses([]);
      });
  }, []);

  // Fetch analytics when course changes
  useEffect(() => {
    if (activeTab !== "risk" && selectedCourseId && dataSource === "platform") {
      // Prevent redundant fetch if we already have the data for this course from session
      if (analytics && selectedCourseId === lastFetchedCourseId.current) {
        return;
      }
      
      setLoading(true);
      fetch(`${API_BASE}/analytics/course/${selectedCourseId}`)
        .then(res => res.json())
        .then(data => {
          setAnalytics(data);
          lastFetchedCourseId.current = selectedCourseId;
          setLoading(false);
        })
        .catch(err => {
          console.error("Error fetching analytics:", err);
          setLoading(false);
        });
    }
  }, [selectedCourseId, dataSource, activeTab]);

  // Risk intelligence is intentionally global: course selection must not scope this tab.
  useEffect(() => {
    if (activeTab !== "risk" || dataSource !== "platform") return;
    const teacherName = authUser?.name || authUser?.email;
    if (!teacherName) return;
    setLoading(true);
    fetch(`${API_BASE}/analytics/risk-global?teacher_name=${encodeURIComponent(teacherName)}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch global risk intelligence");
        return res.json();
      })
      .then(data => {
        setAnalytics(data);
        lastFetchedCourseId.current = null;
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching global risk intelligence:", err);
        setLoading(false);
      });
  }, [activeTab, dataSource, authUser?.name, authUser?.email]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setFileName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("impute_method", imputeMethod);

    try {
      const res = await fetch(`${API_BASE}/analytics/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Upload failed");
      }
      const data = await res.json();
      setUploadedData(data);
      setDataSource("upload");
      setActiveTab("overview");
    } catch (err) {
      console.error("Upload failed:", err);
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleExportReport = () => {
    const data = dataSource === "platform" ? analytics : uploadedData;
    if (!data) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Overview metrics
    csvContent += "OVERVIEW\n";
    if (dataSource === "platform" && analytics) {
      csvContent += `Class Average,${analytics.overview.avg_score}\n`;
      csvContent += `Total Students,${analytics.overview.total_students}\n`;
      csvContent += `At-Risk Count,${analytics.overview.at_risk_count}\n`;
      csvContent += `Attendance Rate,${analytics.overview.attendance_rate}\n`;
    } else if (uploadedData) {
      csvContent += `Class Average,${uploadedData.summary.avg_score}\n`;
      csvContent += `Total Students,${uploadedData.summary.rows}\n`;
    }
    csvContent += "\n";

    // Risk Students Data
    csvContent += "RISK STUDENTS\n";
    csvContent += "Student ID,Student Name,Risk Factor,Risk Level,Avg Score,Missing Data\n";
    const students = data.risk_students || [];
    students.forEach((s: any) => {
      const row = [
        s.id,
        `"${s.name}"`,
        s.missing_data ? "N/A" : s.risk,
        s.missing_data ? "No Data" : s.level,
        s.avgScore,
        s.missing_data ? "Yes" : "No"
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Risk_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const COLORS = ['#264796', '#3460c4', '#d0ae61', '#d97706', '#dc2626'];

  const renderOverview = () => {
    const data = dataSource === "platform" ? analytics : uploadedData;
    if (!data) return <div className="text-center py-20 opacity-50">No data available</div>;

    const stats = dataSource === "platform" 
      ? [
          { label: "Average Score", value: analytics?.overview?.avg_score || "0%", color: "#264796", icon: <TrendingUp size={16}/> },
          { label: "Total Students", value: analytics?.overview?.total_students || 0, color: "#16a34a", icon: <Users size={16}/> },
          { label: "At-Risk Count", value: analytics?.overview?.at_risk_count || 0, color: "#dc2626", icon: <AlertTriangle size={16}/> },
          { label: "Average Attendance", value: analytics?.overview?.attendance_rate || "0%", color: "#d97706", icon: <Activity size={16}/> },
        ]
      : [
          { label: "Average Score", value: `${uploadedData?.summary?.avg_score}${uploadedData?.summary?.scale === 100 ? '%' : ''}`, color: "#264796", icon: <TrendingUp size={16}/> },
          { label: "Total Students", value: uploadedData?.summary?.rows || 0, color: "#16a34a", icon: <Users size={16}/> },
          { label: "At-Risk", value: uploadedData?.risk_students?.length || 0, color: "#dc2626", icon: <AlertTriangle size={16}/> },
          { label: "Average Attendance", value: uploadedData?.summary?.avg_attendance != null ? `${uploadedData.summary.avg_attendance}%` : "Not in upload", color: "#d97706", icon: <Activity size={16}/> },
        ];

    return (
      <div className="space-y-6">
        {/* Missing values banner */}
        {dataSource === "upload" && uploadedData?.summary?.impute_method === "blank" && (uploadedData?.summary?.missing_values ?? 0) > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)" }}>
            <Info size={14} className="text-orange-500 shrink-0" />
            <p className="text-orange-700 font-medium">
              <strong>Keep Blank mode:</strong> {uploadedData.summary.missing_values} missing value{uploadedData.summary.missing_values !== 1 ? 's' : ''} preserved in dataset. Averages and statistics are computed only from available data.
            </p>
          </div>
        )}
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((kpi, i) => (
            <GlassCard key={i} padding="sm" className="flex flex-col items-center text-center group hover:scale-[1.02] transition-all cursor-default bg-white/40">
              <div className="flex items-center gap-1.5 mb-1.5 opacity-60">
                <span style={{ color: kpi.color }}>{kpi.icon}</span>
                <p className="text-[9px] font-bold uppercase tracking-wider">{kpi.label}</p>
              </div>
              <p className="text-xl font-black" style={{ color: kpi.color, fontFamily: "var(--font-display)" }}>{kpi.value}</p>
            </GlassCard>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Main Chart */}
          <GlassCard padding="md" className="h-[350px]">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <TrendingUp size={16} /> {dataSource === "platform" ? "Performance Trend" : "Grade Distribution"}
            </h3>
            <ResponsiveContainer width="100%" height="90%">
              {dataSource === "platform" ? (
                <AreaChart data={analytics?.performance_trend}>
                  <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#264796" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#264796" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#264796" fillOpacity={1} fill="url(#colorAvg)" strokeWidth={3} />
                </AreaChart>
              ) : (
                <BarChart data={uploadedData?.distribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value: any, name: any, props: any) => [
                      `${value} Students (${props.payload.pct}%)`, 
                      "Total"
                    ]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" name="Students" fill="#3460c4" radius={[4, 4, 0, 0]} barSize={40}>
                    {uploadedData?.distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </GlassCard>

          {/* Secondary Stats: Bell Curve */}
          <GlassCard padding="md" className="h-[350px]">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <Activity size={16} /> {dataSource === "platform" ? "Subject Breakdown" : "Student Distribution"}
            </h3>
            <ResponsiveContainer width="100%" height="90%">
              {dataSource === "platform" ? (
                <PieChart>
                  <Pie
                    data={analytics?.subject_breakdown}
                    cx="50%" cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="avg"
                    nameKey="subject"
                  >
                    {analytics?.subject_breakdown?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              ) : (() => {
                const mean = parseFloat(uploadedData?.summary?.avg_score || "0");
                const stdDev = uploadedData?.summary?.std_dev || 10;
                const scale = uploadedData?.summary?.scale || 100;
                
                // Generate normal distribution curve
                const curvePoints = [];
                for (let x = 0; x <= scale; x += scale/40) {
                  const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));
                  curvePoints.push({ x, y: y * 100 }); // Scaled for visibility
                }

                // Plot students on the curve with slight jitter if scores are identical
                const studentPoints = (uploadedData?.student_points || []).map((s, idx) => {
                  const x = s.score;
                  const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));
                  // Add tiny offset to y for overlapping points to make them "thicker"
                  const jitter = (idx % 3 - 1) * 0.5;
                  return { ...s, x, y: (y * 100) + jitter };
                });

                return (
                  <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Score" 
                      domain={[0, scale]} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fontSize: 10}} 
                    />
                    <YAxis type="number" dataKey="y" hide />
                    <ZAxis type="number" range={[100, 100]} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length > 0) {
                          const data = payload[0].payload;
                          if (data.name) {
                            return (
                              <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 min-w-[140px] z-50">
                                <p className="text-xs font-bold text-blue-900">{data.name}</p>
                                <p className="text-[10px] text-slate-500 font-medium">Reg: {data.roll}</p>
                                <div className="h-px bg-slate-100 my-1.5" />
                                <p className="text-[10px] font-black text-gold-600 uppercase tracking-tighter">Score: {data.score.toFixed(1)}</p>
                              </div>
                            );
                          }
                        }
                        return null;
                      }}
                    />
                    {/* The Curve */}
                    <Scatter 
                      data={curvePoints} 
                      line={{ stroke: '#264796', strokeWidth: 2 }} 
                      shape={() => null} 
                      isAnimationActive={false}
                    />
                    {/* The Students */}
                    <Scatter 
                      name="Students"
                      data={studentPoints} 
                      fill="#d97706" 
                      stroke="#fff" 
                      strokeWidth={2}
                      shape="circle"
                    />
                  </ScatterChart>
                );
              })()}
            </ResponsiveContainer>
          </GlassCard>
        </div>
      </div>
    );
  };

  const renderRiskTable = () => {
    const students = dataSource === "platform" ? analytics?.risk_students : uploadedData?.risk_students;
    if (!students || students.length === 0) return <div className="text-center py-20 opacity-50">No at-risk students identified</div>;

    const isMissingMode = dataSource === "upload" && uploadedData?.summary?.impute_method === "blank";

    return (
      <div className="space-y-3">
        {isMissingMode && (
          <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
            style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)" }}>
            <AlertTriangle size={14} className="text-orange-500 shrink-0" />
            <p className="text-orange-700 font-medium">
              <strong>Hide Imputation active:</strong> Students with missing score data are flagged separately below.
            </p>
          </div>
        )}
        {students.map((s: any) => (
          <div key={s.id} className="animate-fade-in-up">
            <div
              className="flex items-center gap-3 p-4 rounded-xl cursor-pointer hover:shadow-md transition-all bg-white/60 border border-slate-100 hover:border-blue-200"
              onClick={() => setExpandedStudent(expandedStudent === s.id ? null : s.id)}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                s.missing_data ? "bg-yellow-100 text-yellow-700" :
                s.level === "high" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
              }`}>
                {s.missing_data ? "?" : s.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                  {s.missing_data && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">
                      MISSING DATA
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{s.id}</p>
              </div>
              {!s.missing_data && (
                <div className="flex gap-4">
                   <RiskCell value={100 - (s.attendance ?? 80)} label="Absent" />
                   <RiskCell value={100 - s.avgScore} label="Marks" />
                </div>
              )}
              <div className="w-16 text-center">
                <p className={`text-lg font-black ${s.missing_data ? "text-yellow-600" : s.level === "high" ? "text-red-600" : "text-orange-600"}`}>{s.missing_data ? "—" : s.risk}</p>
                <span className={`text-[9px] font-bold uppercase ${s.missing_data ? "text-yellow-500" : s.level === "high" ? "text-red-500" : "text-orange-500"}`}>{s.missing_data ? "no data" : s.level}</span>
              </div>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedStudent === s.id ? "rotate-180" : ""}`} />
            </div>
            {expandedStudent === s.id && (
              <div className="mx-4 p-4 rounded-b-xl border-x border-b border-slate-100 bg-slate-50/50 animate-slide-down space-y-4">
                {s.missing_data ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-yellow-700 font-semibold mb-1">No score data available</p>
                    <p className="text-xs text-slate-500">This student has missing values in the dataset. Switch to an imputation method to estimate their score.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-white rounded-lg border border-slate-100 text-center">
                        <p className="text-xs text-slate-500 mb-1">Avg Score</p>
                        <p className="text-lg font-bold text-slate-800">{s.avgScore.toFixed(1)}%</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-100 text-center">
                        <p className="text-xs text-slate-500 mb-1">Attendance</p>
                        <p className="text-lg font-bold text-slate-800">{s.attendance ?? 85}%</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-100 text-center">
                        <p className="text-xs text-slate-500 mb-1">Risk Factor</p>
                        <p className={`text-lg font-bold ${s.level === 'high' ? 'text-red-600' : 'text-orange-600'}`}>{s.risk}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent" style={{ fontFamily: "var(--font-display)" }}>
            Risk Intelligence Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">Real-time performance monitoring and predictive risk analytics.</p>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-100 shadow-sm self-start">
          <button 
            onClick={() => setDataSource("platform")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              dataSource === "platform" ? "bg-blue-900 text-white shadow-lg shadow-blue-900/20" : "text-slate-400 hover:bg-slate-50"
            }`}
          >
            <Database size={16} /> Platform Data
          </button>

          {!uploadedData ? (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition-all"
            >
              <Upload size={16} /> Upload Data
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-blue-50 rounded-xl p-0.5 border border-blue-100">
              <button 
                onClick={() => setDataSource("upload")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  dataSource === "upload" 
                    ? "bg-blue-900 text-white shadow-lg shadow-blue-900/20" 
                    : "text-blue-900 hover:bg-blue-100/50"
                }`}
              >
                <FileSpreadsheet size={16} />
                <span>{fileName || "External Dataset"}</span>
              </button>
              <button 
                onClick={() => {
                  setUploadedData(null);
                  setDataSource("platform");
                  setFileName("");
                }}
                className="px-2 py-2 text-blue-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                title="Clear Data"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-y border-slate-100">
        <div className="flex items-center gap-3">
          {dataSource === "platform" && activeTab === "risk" ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-700 text-sm font-bold">
              <AlertTriangle size={16} /> All Courses
            </div>
          ) : dataSource === "platform" ? (
            <>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Selected Course:</span>
              <div className="relative">
                <select 
                  className="bg-transparent border-none font-bold text-blue-900 text-sm focus:ring-0 cursor-pointer pr-8"
                  value={selectedCourseId || ""}
                  onChange={e => setSelectedCourseId(Number(e.target.value))}
                >
                  {Array.isArray(courses) && courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-blue-900 pointer-events-none" />
              </div>
            </>
          ) : (
            <>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Data Context:</span>
              <div className="flex flex-col gap-0.5 ml-1">
                <span className="text-[11px] text-slate-600 font-bold flex items-center gap-1">
                   <Activity size={12} className="text-blue-500" /> {uploadedData?.summary?.score_column} Analysis
                </span>
                <span className="text-[9px] text-slate-400 font-medium">
                   Scale: <span className="text-blue-600 font-bold">Out of {uploadedData?.summary?.scale}</span> • Rows: <span className="text-blue-600 font-bold">{uploadedData?.summary?.rows}</span>
                </span>
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-blue-500 font-bold hover:underline ml-4">Replace File</button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => {
            if (dataSource === "platform" && activeTab === "risk") {
              const teacherName = authUser?.name || authUser?.email;
              if (!teacherName) return;
              setLoading(true);
              fetch(`${API_BASE}/analytics/risk-global?teacher_name=${encodeURIComponent(teacherName)}`)
                .then(res => res.json())
                .then(data => { setAnalytics(data); lastFetchedCourseId.current = null; setLoading(false); })
                .catch(() => setLoading(false));
            } else if (dataSource === "platform" && selectedCourseId) {
              setLoading(true);
              fetch(`${API_BASE}/analytics/course/${selectedCourseId}`)
                .then(res => res.json())
                .then(data => { setAnalytics(data); setLoading(false); })
                .catch(() => setLoading(false));
            }
          }} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors">
            <RefreshCw size={18} className={loading || uploading ? "animate-spin" : ""} />
          </button>
          <button 
            onClick={handleExportReport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
          >
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        accept=".csv,.xlsx,.xls"
      />

      {/* Tabs Navigation */}
      <div className="flex gap-1 bg-slate-100/50 p-1 rounded-2xl w-fit">
        {(["overview", "risk", "subjects", "raw"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold capitalize transition-all ${
              activeTab === tab ? "bg-white text-blue-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {tab === "risk" ? "Risk Heatmap" : tab === "subjects" ? "Detailed Insights" : tab}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="min-h-[500px]">
        {loading || uploading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <div className="w-12 h-12 border-4 border-blue-900/10 border-t-blue-900 rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-500">{uploading ? "Analyzing document patterns..." : "Crunching platform data..."}</p>
          </div>
        ) : (
          <>
            {activeTab === "overview" && renderOverview()}
            {activeTab === "risk" && renderRiskTable()}
            {activeTab === "subjects" && (
              <GlassCard className="p-6">
                <h3 className="text-lg font-bold mb-6">Subject Performance Distribution</h3>
                <div className="space-y-8">
                  {(dataSource === "platform" ? analytics?.subject_breakdown : uploadedData?.distribution)?.map((item: any, idx: number) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="text-sm font-bold text-slate-700">{item.subject || item.grade}</span>
                        <span className="text-sm font-black text-blue-900">{item.avg || item.pct}%</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-1000 ease-out rounded-full"
                          style={{ 
                            width: `${item.avg || item.pct}%`, 
                            background: `linear-gradient(90deg, ${COLORS[idx % COLORS.length]}, ${COLORS[idx % COLORS.length]}dd)`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {activeTab === "raw" && (
              <GlassCard className="overflow-hidden border border-slate-100 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {(dataSource === "platform" ? ['Student', 'Score', 'Exam', 'Date'] : (uploadedData?.summary?.columns || []))?.map(col => (
                          <th key={col} className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(dataSource === "platform" ? (analytics?.raw_data || []) : (uploadedData?.raw_data || []))?.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          {(dataSource === "platform" ? ['Student', 'Score', 'Exam', 'Date'] : (uploadedData?.summary?.columns || []))?.map((col: string) => {
                            const val = row[col];
                            const isMissing = val === null || val === undefined || val === '';
                            return (
                              <td key={col} className={`px-4 py-3 font-medium ${isMissing ? 'text-slate-300 italic' : 'text-slate-600'}`}>
                                {isMissing ? '—' : String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {dataSource === "platform" && (analytics?.raw_data || []).length === 0 && (
                        <tr><td colSpan={4} className="py-20 text-center opacity-40">No raw data found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}
          </>
        )}
      </div>
    </div>
  );
};
