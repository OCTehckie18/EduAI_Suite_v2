import { useCallback, useEffect, useState } from "react";
import { BarChart3, Building2, GraduationCap, Landmark, Layers, LogOut, FileText, Menu, Megaphone, Paintbrush, Award, Scale, ToggleRight, RefreshCw, Search, Trash2, UserCheck, Users, X } from "lucide-react";
import logo from "../../logo/eduai_logo.png";
import { LoginScreen } from "./Login";
import { ThemeToggle } from "./shared/ThemeToggle";
import { RosterPanel } from "./RosterPanel";
import { StaffRosterPanel } from "./StaffRosterPanel";
import { StructurePanel } from "./StructurePanel";
import { LookPanel } from "./LookPanel";
import { ModulesPanel } from "./ModulesPanel";
import { AcademicPanel } from "./AcademicPanel";
import { DocumentsPanel } from "./DocumentsPanel";
import { NoticePanel } from "./NoticePanel";
import { RulesPanel } from "./RulesPanel";
import { UniversityPanel } from "./UniversityPanel";
import { ApprovalsPanel } from "./panels/ApprovalsPanel";
import { CampusPanel } from "./panels/CampusPanel";
import { OverviewPanel } from "./panels/OverviewPanel";
import { RecycleBinPanel } from "./panels/RecycleBinPanel";
import { UsersPanel } from "./panels/UsersPanel";
import { API_ENDPOINTS } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { NoticeBanner, PortalName, UniversityBadge, useDocumentTitle } from "./shared/university";
import { AdminUser, Overview, TabKey } from "./types";
import { Avatar, UIProvider } from "./ui";

interface TabDef { tab: TabKey; label: string; title: string; subtitle: string; Icon: typeof Users; color: string; search: boolean }

const NAV: { heading: string; items: TabDef[] }[] = [
  { heading: "", items: [
    { tab: "overview", label: "Overview", title: "Overview", subtitle: "Where your institution stands today", Icon: BarChart3, color: "text-brand-blue", search: false },
  ] },
  { heading: "Institution", items: [
    { tab: "university", label: "University", title: "University", subtitle: "Name, logo and contact details shown across every portal", Icon: Landmark, color: "text-yellow-700", search: false },
    { tab: "campuses", label: "Campuses", title: "Campuses", subtitle: "The campuses of your university", Icon: Building2, color: "text-emerald-600", search: true },
    { tab: "structure", label: "Structure", title: "Institution structure", subtitle: "Schools, departments, programs, classes and sections", Icon: Layers, color: "text-teal-600", search: true },
  ] },
  { heading: "People", items: [
    { tab: "roster", label: "Student roster", title: "Student roster", subtitle: "Admitted students who may sign up on EduGames", Icon: GraduationCap, color: "text-lime-600", search: true },
    { tab: "approvals", label: "Teacher roster", title: "Teacher roster", subtitle: "Listed teachers are approved on sign-in", Icon: UserCheck, color: "text-amber-600", search: true },
    { tab: "users", label: "Users", title: "Users", subtitle: "Every account across the platform", Icon: Users, color: "text-sky-600", search: true },
  ] },
  { heading: "Maintenance", items: [
    { tab: "recycle_bin", label: "Recycle bin", title: "Recycle bin", subtitle: "Restore anything that was deactivated", Icon: Trash2, color: "text-rose-600", search: true },
  ] },
];
const SETTINGS_TABS: TabDef[] = [
    { tab: "look", label: "Look & feel", title: "Look and feel", subtitle: "Fonts, corners, portal names and sign-in pages for every portal", Icon: Paintbrush, color: "text-orange-600", search: false },
    { tab: "modules", label: "Modules", title: "Modules", subtitle: "Switch off what your university does not use", Icon: ToggleRight, color: "text-emerald-600", search: false },
    { tab: "rules", label: "Rules", title: "Rules", subtitle: "Exams, sign-in, accounts and the risk score", Icon: Scale, color: "text-sky-700", search: false },
    { tab: "notice", label: "Notice & help", title: "Notice and help", subtitle: "A banner for everyone, and your help desk details", Icon: Megaphone, color: "text-amber-600", search: false },
    { tab: "academic", label: "Grading & calendar", title: "Grading and calendar", subtitle: "Grade scale, terms, time zone and holidays", Icon: Award, color: "text-lime-700", search: false },
    { tab: "documents", label: "Documents", title: "Documents", subtitle: "Letterhead for reports and printed answer sheets", Icon: FileText, color: "text-slate-600", search: false },
];
/** Everything under the University page: the details first, then one tab per group of settings. */
const UNIVERSITY_TABS: TabKey[] = ["university", ...SETTINGS_TABS.map((item) => item.tab)];
const TAB_LABELS: Partial<Record<TabKey, string>> = { university: "Details", ...Object.fromEntries(SETTINGS_TABS.map((item) => [item.tab, item.label])) };
const TABS = [...NAV.flatMap((group) => group.items), ...SETTINGS_TABS];
const tabFromHash = (): TabKey => {
  const key = window.location.hash.replace("#", "").replace("university/", "") as TabKey;
  return TABS.some((tab) => tab.tab === key) ? key : "overview";
};

const clearSession = () => {
  ["token", "refresh_token", "user", "lastActivity"].forEach((key) => localStorage.removeItem(key));
};

function Dashboard({ user, onSignOut }: { user: AdminUser; onSignOut: () => void }) {
  const [tab, setTab] = useState<TabKey>(tabFromHash);
  const [search, setSearch] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await requestJson<Overview>(`${API_ENDPOINTS.MASTER_ADMIN}/overview/`));
      setOverviewError(false);
    } catch {
      setOverviewError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    const onHash = () => { setTab(tabFromHash()); setSearch(""); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: TabKey) => {
    window.location.hash = UNIVERSITY_TABS.includes(next) && next !== "university" ? `university/${next}` : next;
    setTab(next);
    setSearch("");
    setMenuOpen(false);
  };
  const refresh = () => { void loadOverview(); setRefreshKey((key) => key + 1); };
  const inUniversity = UNIVERSITY_TABS.includes(tab);
  const active = TABS.find((item) => item.tab === tab) ?? TABS[0];
  const pending = overview?.users.pending_teacher_approvals ?? 0;
  const displayName = user.name || user.email;

  const panel = {
    overview: <OverviewPanel overview={overview} loadFailed={overviewError} onRetry={refresh} onNavigate={go} refreshKey={refreshKey} />,
    university: <UniversityPanel />,
    look: <LookPanel />,
    modules: <ModulesPanel />,
    rules: <RulesPanel />,
    notice: <NoticePanel />,
    academic: <AcademicPanel />,
    documents: <DocumentsPanel />,
    campuses: <CampusPanel key={refreshKey} search={search} onChanged={loadOverview} />,
    structure: <StructurePanel key={refreshKey} search={search} onChanged={loadOverview} />,
    roster: <RosterPanel key={refreshKey} search={search} />,
    approvals: <div key={refreshKey} className="space-y-6"><ApprovalsPanel search={search} onChanged={loadOverview} /><StaffRosterPanel search={search} onChanged={loadOverview} /></div>,
    users: <UsersPanel key={refreshKey} search={search} onChanged={loadOverview} />,
    recycle_bin: <RecycleBinPanel key={refreshKey} search={search} onChanged={loadOverview} />,
  }[tab];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col justify-between overflow-y-auto border-r border-slate-200 bg-white p-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div>
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-blue to-brand-gold shadow-lg shadow-rose-900/30"><img src={logo} alt="EduAI Suite" className="h-8 w-8 object-contain" /></div>
              <div><h1 className="text-lg font-bold text-slate-900">EduAI Suite</h1><span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700"><PortalName portal="master_admin" fallback="Master Admin" /></span></div>
            </div>
            <button onClick={() => setMenuOpen(false)} className="rounded-lg p-1 text-slate-500 hover:text-slate-900 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
          </div>
          <nav className="space-y-5" aria-label="Main">
            {NAV.map((group) => (
              <div key={group.heading || "top"}>
                {group.heading && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.heading}</p>}
                <div className="space-y-1">
                  {group.items.map(({ tab: key, label, Icon, color }) => (
                    <button key={key} onClick={() => go(key)} aria-current={tab === key || (key === "university" && inUniversity) ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${tab === key || (key === "university" && inUniversity) ? "border border-slate-300 bg-slate-100 text-slate-900 shadow" : "border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                      <Icon className={`h-4 w-4 ${color}`} />{label}
                      {key === "approvals" && pending > 0 && <span className="ml-auto rounded-full bg-amber-700 px-2 py-0.5 text-[11px] font-bold text-white">{pending}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className={`mb-1 flex items-center gap-2 text-xs font-semibold ${overviewError ? "text-rose-600" : loading ? "text-brand-blue" : "text-emerald-600"}`}>
            <span className={`h-2 w-2 rounded-full ${overviewError ? "bg-rose-400" : loading ? "animate-pulse bg-amber-300" : "bg-emerald-400"}`} />
            {overviewError ? "Backend unreachable" : loading ? "Syncing..." : "Backend connected"}
          </div>
          <p className="truncate text-[11px] text-slate-500">{user.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
          <button onClick={() => setMenuOpen(true)} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:text-slate-900 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-[11rem] flex-1"><h2 className="truncate text-xl font-bold tracking-tight text-slate-900">{active.title}</h2><p className="hidden truncate text-sm text-slate-500 sm:block">{active.subtitle}</p></div>
          {active.search && (
            <div className="relative order-last w-full sm:order-none sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input type="search" placeholder="Search this page..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
            </div>
          )}
          <button onClick={refresh} disabled={loading} className="rounded-xl border border-slate-300 p-2 text-slate-700 hover:text-slate-900 disabled:opacity-50" title="Refresh" aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          <ThemeToggle />
          <UniversityBadge labelClassName="text-slate-800" />
          <div className="flex items-center gap-2"><Avatar name={displayName} /><div className="hidden text-left leading-tight md:block"><p className="max-w-[10rem] truncate text-xs font-semibold text-slate-900">{displayName}</p><p className="text-[11px] text-slate-500">Master Admin</p></div></div>
          <button onClick={onSignOut} className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:text-slate-900"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button>
        </header>
        <NoticeBanner />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8">
          {inUniversity && <div role="tablist" aria-label="University settings" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
            {UNIVERSITY_TABS.map((key) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => go(key)} className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === key ? "border-brand-blue text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{TAB_LABELS[key]}</button>)}
          </div>}
          {panel}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  useDocumentTitle("Master Admin", "master_admin");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setAuthLoading(false);
      return;
    }
    requestJson<{ user: AdminUser }>(`${API_ENDPOINTS.AUTH}/me/`)
      .then((data) => {
        if (data.user.role_code !== "MASTER_ADMIN") throw new Error("Access denied.");
        setUser(data.user);
      })
      .catch(() => { clearSession(); setUser(null); })
      .finally(() => setAuthLoading(false));
  }, []);

  const signOut = () => { clearSession(); setUser(null); };

  return (
    <UIProvider>
      {authLoading
        ? <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">Checking your session...</div>
        : user ? <Dashboard user={user} onSignOut={signOut} /> : <LoginScreen onLogin={setUser} />}
    </UIProvider>
  );
}
