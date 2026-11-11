import React, { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Gamepad2, LayoutDashboard, ClipboardList, CalendarClock, LogOut, ChevronRight, Menu, Calendar, FileSignature, TrendingUp } from "lucide-react";
import logo from "../../../logo/eduai_logo.png";
import { useAuthStore } from "../store/useAuthStore";
import { useSessionTimeout } from "../shared/hooks/useSessionTimeout";
import { DESKTOP_QUERY, useMediaQuery } from "../shared/hooks/useMediaQuery";
import { ProfileModal } from "../shared/components/ProfileModal";
import { PortalName, UniversityBadge, moduleOn, rulesOf, useUniversity, type ModuleKey } from "../shared/university";
import { NotificationBell } from "../shared/components/NotificationBell";
import { ThemeToggle } from "../shared/ThemeToggle";

// Entries that belong to a module the university can switch off. EduGames goes once every game is off.
const NAV_MODULES: Record<string, ModuleKey[]> = {
  "/games": ["live_quizzes", "chain_answer", "word_cloud", "trello"],
  "/appointments": ["appointments"], "/forms": ["forms"],
};

const studentNavItems = [
  { icon: LayoutDashboard, label: "My Dashboard", href: "/", end: true },
  { icon: BookOpen, label: "My Classrooms", href: "/classroom" },
  { icon: TrendingUp, label: "My Progress", href: "/progress" },
  { icon: ClipboardList, label: "Exams", href: "/exams" },
  { icon: Gamepad2, label: "EduGames", href: "/games" },
  { icon: Calendar, label: "My Calendar", href: "/calendar" },
  { icon: CalendarClock, label: "Appointments", href: "/appointments" },
  { icon: FileSignature, label: "Forms", href: "/forms" },
];

export const StudentShell: React.FC = () => {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const shellUniversity = useUniversity();
  // Desktop: expanded/collapsed rail. Below 1024px: drawer open/closed (closed by default).
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const { logout, role } = useAuthStore();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  const sessionMinutes = rulesOf(useUniversity()).signin.session_minutes;
  const remainingTime = useSessionTimeout(sessionMinutes * 60000);

  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

  // The account menu closes when you click anywhere else or press Escape.
  useEffect(() => {
    if (!profileOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!role || !localStorage.getItem("token")) {
      navigate("/login");
    } else {
      const storedUser = localStorage.getItem("user");
      if (storedUser) setUser(JSON.parse(storedUser));
    }
  }, [role, navigate]);

  if (!role) return null;

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : "ST";

  return (
    <div className="flex min-h-screen min-h-dvh" style={{ background: "var(--color-surface-base)" }}>
      {/* ── Sidebar ── */}
      {!isDesktop && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`glass-sidebar flex flex-col fixed h-full z-50 transition-all duration-300 ${
        isDesktop
          ? sidebarOpen ? "w-64" : "w-[72px]"
          : `w-64 max-w-[85vw] ${sidebarOpen ? "translate-x-0" : "-translate-x-full shadow-none pointer-events-none"}`
      }`} style={!isDesktop && !sidebarOpen ? { boxShadow: "none" } : undefined}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/8">
          <div className="shrink-0 w-9 h-9 rounded-xl overflow-hidden bg-white flex items-center justify-center shadow-lg cursor-pointer" role="button" tabIndex={0} aria-label={sidebarOpen ? "Collapse the menu" : "Expand the menu"} onClick={() => setSidebarOpen(s => !s)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSidebarOpen(s => !s); } }}>
            <img src={logo} alt="EduAI Suite" className="w-full h-full object-contain p-0.5" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-white font-bold text-[13px] leading-tight whitespace-nowrap font-display"><PortalName portal="edugames" fallback="EduGames Portal" /></p>
              <p className="text-[9.5px] font-semibold uppercase tracking-widest whitespace-nowrap" style={{ color: "var(--color-brand-gold)" }}>Student View</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {studentNavItems.filter((item) => !NAV_MODULES[item.href] || NAV_MODULES[item.href].some((key) => moduleOn(shellUniversity, key))).map((item) => (
            <NavLink key={item.href} to={item.href} end={item.end} aria-label={item.label} title={sidebarOpen ? undefined : item.label} className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? "nav-item-active" : ""}`}>
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <span className={`shrink-0 transition-all ${isActive ? "text-white" : "text-white/55"}`}>
                    <item.icon size={19} />
                  </span>
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                  {sidebarOpen && isActive && <ChevronRight size={14} className="ml-auto opacity-60" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Links */}
        <div className="px-3 pb-4 border-t border-white/8 pt-3 space-y-1">
          <button onClick={() => { logout(); navigate("/login"); }} className="nav-item text-red-300/80 hover:text-red-200 hover:bg-red-500/10 w-full">
            <LogOut size={19} className="shrink-0" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className={`flex-1 min-w-0 transition-all duration-300 ${isDesktop ? (sidebarOpen ? "ml-64" : "ml-[72px]") : "ml-0"}`}>
        <header className="sticky top-0 z-30 h-[70px] flex items-center justify-between px-4 sm:px-6 gap-4" style={{ background: "var(--color-header-bg)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)} aria-label={sidebarOpen ? "Close the menu" : "Open the menu"} aria-expanded={sidebarOpen} className="p-2 rounded-lg transition-colors text-slate-400 hover:text-blue-700 hover:bg-blue-50">
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Session Timer */}
            <div className="hidden px-2 py-1 bg-red-500/10 text-red-600 rounded-md text-xs font-bold font-mono border border-red-500/20 shadow-sm" title="Session Timeout">
              {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}
            </div>

            <UniversityBadge className="mr-1" labelClassName="text-[color:var(--color-text-primary)]" />
            <ThemeToggle />
            <NotificationBell />
            {/* Profile */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full transition-all hover:bg-slate-100 border border-slate-200/80"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow bg-emerald-500">
                  {initials}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{user?.name || "Student"}</p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>Student</p>
                </div>
              </button>

              {profileOpen && (
                <div className="glass-card absolute right-0 top-12 w-72 max-w-[calc(100vw-1.5rem)] z-50 overflow-hidden animate-fade-in py-1">
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-sm font-bold break-words" style={{ color: 'var(--color-text-primary)' }}>{user?.name || "Student"}</p>
                    <p className="text-[11px] mt-0.5 break-all" style={{ color: 'var(--color-text-secondary)' }}>{user?.email || ""}</p>
                    <span className="badge mt-2" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Student</span>
                  </div>
                  <button
                    onClick={() => { setProfileOpen(false); setProfileModalOpen(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-brand-blue)'; e.currentTarget.style.backgroundColor = 'var(--color-border)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    Edit Profile
                  </button>

                  <div className="border-t mt-1" style={{ borderColor: 'var(--color-border)' }}>
                    <button onClick={() => { logout(); navigate("/login"); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-500 transition-colors"
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 min-h-[calc(100vh-70px)] min-h-[calc(100dvh-70px)]">
          <Outlet />
        </div>
        {profileModalOpen && (
          <ProfileModal
            onClose={() => setProfileModalOpen(false)}
            onSaved={(updated) => {
              const merged = { ...user, ...updated };
              localStorage.setItem("user", JSON.stringify(merged));
              setUser(merged);
            }}
          />
        )}
      </main>

    </div>
  );
};
