import React, { useState, useRef, useEffect, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  BarChart3,
  MessageSquare,
  Bell,
  Settings,
  LogOut,
  Search,
  CheckSquare,
  FileSpreadsheet,
  FileSignature,
  Activity,
  X,
  Menu,
  Gamepad2,
  Wrench,
  Calendar,
  ClipboardList,
  Mail,
  Shield,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import logo from "../assets/logo (5).png";
import { API_ENDPOINTS } from "../shared/utils/apiConfig";
import { useSessionTimeout } from "../shared/hooks/useSessionTimeout";


// uncomment to view the modesl
const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", end: true, keywords: "home overview summary stats" },
  { icon: Wrench, label: "Teacher Tools", href: "/tools", keywords: "question paper generator quiz" },
  { icon: Gamepad2, label: "Game Studio", href: "/games", keywords: "gamify create play interactive" },
  { icon: Calendar, label: "Appointments", href: "/appointments", keywords: "bookings approvals office hours" },
  { icon: BookOpen, label: "Classrooms", href: "/classrooms", keywords: "courses students assignments" },
  { icon: ClipboardList, label: "Exams", href: "/exams", keywords: "mcq test assessment quiz" },
  // { icon: CheckSquare, label: "OMR Grading", href: "/omr", keywords: "grade paper omr image scan answers ai score" },
  { icon: FileSpreadsheet, label: "Reports", href: "/reports", keywords: "export download pdf analytics" },
  // { icon: FileSignature, label: "Form Automation", href: "/forms", keywords: "template auto-fill document" },
  { icon: Activity, label: "Analytics & Risk", href: "/analytics", keywords: "risk alert attendance prediction" },
  { icon: Mail, label: "Mail Students", href: "/mail", keywords: "email send students parents bulk communication" },
  { icon: Calendar, label: "Calendar", href: "/calendar", keywords: "calendar events schedule deadlines" },
  // { icon: MessageSquare, label: "AI Assistant", href: "/chat", keywords: "chat ask help bot" },
  // { icon: Settings, label: "Settings", href: "/settings", keywords: "preferences config account" },
];

const formatRelativeTime = (date: string | Date) => {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const getNotifHref = (feature: string) => {
  switch (feature.toLowerCase()) {
    case 'appointment': return '/appointments';
    case 'mail': return '/mail';
    case 'calendar': return '/calendar';
    case 'exam': return '/exams';
    case 'student': return '/classrooms';
    case 'classroom': return '/classrooms';
    case 'omr': return '/exams';
    default: return '/';
  }
};

export const DashboardShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuthStore();
  const [user, setUser] = useState<any>(null);

  // Call session timeout hook (15 minutes = 900,000 ms)
  const remainingTime = useSessionTimeout(900000);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastNotifIdRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ title: string; desc: string; href: string } | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.HISTORY}/`);
      if (response.ok) {
        const data = await response.json();
        const lastRead = localStorage.getItem("last_notif_read") || "0";
        const lastReadTime = new Date(lastRead).getTime();

        const formatted = data.slice(0, 10).map((h: any) => ({
          id: h.id,
          title: h.feature.charAt(0).toUpperCase() + h.feature.slice(1),
          desc: h.action.replace(/_/g, ' '),
          time: formatRelativeTime(h.timestamp),
          timestamp: new Date(h.timestamp).getTime(),
          unread: new Date(h.timestamp).getTime() > lastReadTime,
          href: getNotifHref(h.feature)
        }));

        setNotifications(formatted);
        const newUnread = formatted.filter((n: any) => n.unread);
        setUnreadCount(newUnread.length);

        if (formatted.length > 0) {
          const newest = formatted[0];
          if (lastNotifIdRef.current !== null && newest.id > lastNotifIdRef.current && newest.unread) {
            setToast({ title: newest.title, desc: newest.desc, href: newest.href });
            setTimeout(() => setToast(null), 6000);
          }
          lastNotifIdRef.current = newest.id;
        }
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, []);  // stable — no deps that change

  // Auth check — runs ONCE on mount only
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        logout();
        navigate("/login");
      }
    } else {
      logout();
      navigate("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notification polling — separate from auth, only runs when user is set
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications]);

  const handleNotifToggle = () => {
    if (!notifOpen) {
      setNotifOpen(true);
      setProfileOpen(false);
      // Mark as read
      const now = new Date().toISOString();
      localStorage.setItem("last_notif_read", now);
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    } else {
      setNotifOpen(false);
    }
  };

  // Filter nav items based on search query
  const searchResults = searchQuery.trim()
    ? navItems.filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.keywords && item.keywords.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    : [];

  // Navigate to a search result and clear
  const handleSearchSelect = useCallback((href: string) => {
    navigate(href);
    setSearchQuery("");
    setSearchFocused(false);
    searchRef.current?.blur();
  }, [navigate]);

  // Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchFocused(true);
      }
      if (e.key === "Escape") {
        setSearchFocused(false);
        setSearchQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--color-surface-base)", color: "var(--color-text-primary)" }}>

      {/* ── Top App Bar ──────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-[64px] flex items-center justify-between px-4"
        style={{ background: "var(--color-header-bg)", borderBottom: "1px solid var(--color-border)" }}>

        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "transparent" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--color-border)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <Menu size={24} />
          </button>

          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded shrink-0 bg-white shadow-sm flex items-center justify-center p-0.5">
              <img src={logo} alt="EduAI Logo" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:block">
              <p className="font-bold text-lg leading-none" style={{ color: "var(--color-text-primary)" }}>EduAI Suite</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: "var(--color-brand-gold)" }}>TeacherBuddy</p>
            </div>
          </div>
        </div>

        {/* Center: Search (Visible on md and up) */}
        <div className="flex-1 max-w-2xl px-4 hidden md:flex justify-center">
          <div className="relative w-full max-w-[500px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" style={{ color: "var(--color-text-muted)" }} />
            <input
              ref={searchRef}
              className="w-full pl-10 pr-16 py-2.5 text-sm transition-all focus:outline-none rounded-xl"
              placeholder="Search anything (Ctrl+K)..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchFocused(true); }}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={e => {
                if (e.key === "Enter" && searchResults.length > 0) {
                  handleSearchSelect(searchResults[0].href);
                }
                if (e.key === "Escape") {
                  setSearchFocused(false);
                  setSearchQuery("");
                  searchRef.current?.blur();
                }
              }}
              style={{
                background: searchFocused ? "var(--color-surface-base)" : "rgba(100,116,139,0.08)",
                border: searchFocused ? "1px solid var(--color-brand-blue)" : "1px solid transparent",
                color: "var(--color-text-primary)"
              }}
            />
            {/* Search Results Dropdown */}
            {searchFocused && searchQuery.trim() && (
              <div
                className="absolute top-full left-0 mt-2 w-full rounded-xl overflow-hidden animate-fade-in z-50 border shadow-lg"
                style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)", boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
              >
                {searchResults.length > 0 ? (
                  <div className="py-1">
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>
                      Pages — {searchResults.length} result{searchResults.length > 1 ? "s" : ""}
                    </p>
                    {searchResults.map((item, i) => (
                      <button
                        key={item.href}
                        onClick={() => handleSearchSelect(item.href)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--color-border)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--color-bg-grad1)" }}>
                          <item.icon size={16} style={{ color: "var(--color-brand-blue)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{item.label}</p>
                          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Navigate to {item.href}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <Search size={24} className="mx-auto mb-2" style={{ color: "var(--color-text-muted)" }} />
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>No results found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">

          {/* Session Timer */}
          <div className="hidden px-2 py-1 bg-red-500/10 text-red-600 rounded-md text-xs font-bold font-mono border border-red-500/20 shadow-sm" title="Session Timeout">
            {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}
          </div>


          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={handleNotifToggle}
              className="p-2 rounded-full transition-colors relative"
              style={{
                color: notifOpen ? "var(--color-brand-blue)" : "var(--color-text-muted)",
                backgroundColor: notifOpen ? "var(--color-border)" : "transparent"
              }}
              onMouseEnter={e => !notifOpen && (e.currentTarget.style.backgroundColor = "var(--color-border)")}
              onMouseLeave={e => !notifOpen && (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{ background: "var(--color-brand-gold)", borderColor: "var(--color-header-bg)" }} />
              )}
            </button>

            {/* Notifications Dropdown */}
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 rounded-xl z-50 overflow-hidden animate-fade-in border shadow-lg"
                style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Notifications</p>
                  <button onClick={() => setNotifOpen(false)} style={{ color: 'var(--color-text-muted)' }}><X size={16} /></button>
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto custom-scrollbar" style={{ borderColor: 'var(--color-border)' }}>
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div key={n.id} className="px-4 py-3 flex gap-3 cursor-pointer transition-colors"
                        onClick={() => { navigate(n.href); setNotifOpen(false); }}
                        style={{ backgroundColor: n.unread ? 'rgba(38, 71, 150, 0.05)' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = n.unread ? 'rgba(38, 71, 150, 0.05)' : 'transparent'}>
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ background: n.unread ? "var(--color-brand-blue)" : "transparent", border: n.unread ? "none" : "1.5px solid var(--color-text-muted)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{n.title}</p>
                          <p className="text-[11px] leading-relaxed mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{n.desc}</p>
                          <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{n.time}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <Bell size={24} className="mx-auto mb-2 opacity-20" />
                      <p className="text-sm font-medium opacity-40">No new notifications</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 hidden sm:block" style={{ backgroundColor: "var(--color-border)" }} />

          {/* Profile */}
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full transition-colors border"
              style={{ borderColor: "var(--color-border)" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--color-border)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                style={{ background: "linear-gradient(135deg,#264796,#3460c4)" }}>
                {user?.name?.charAt(0) || "U"}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--color-text-primary)' }}>{user?.name || "User"}</p>
              </div>
            </button>

            {/* Profile Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 top-12 w-52 rounded-xl z-50 overflow-hidden animate-fade-in py-1 border shadow-lg"
                style={{ background: "var(--color-surface-base)", borderColor: "var(--color-border)" }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{user?.name || "EduAI User"}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{user?.email || "user@eduai.com"}</p>
                </div>
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

      {/* ── Sidebar Drawer ───────────────────────────────────── */}
      <aside
        className={`fixed top-[64px] bottom-0 left-0 z-40 w-[260px] flex flex-col transition-transform duration-300 transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        style={{
          background: "var(--color-surface-sidebar)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        <nav className="flex-1 overflow-y-auto py-4 pr-3 space-y-1 custom-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.end}
              className={({ isActive }: { isActive: boolean }) =>
                `flex items-center gap-4 px-5 py-3.5 rounded-r-full transition-all group ${isActive
                  ? "bg-brand-blue/10 text-brand-blue shadow-sm"
                  : "hover:bg-brand-blue/5"
                }`
              }
              style={({ isActive }: { isActive: boolean }) => ({
                color: isActive ? "" : "var(--color-text-secondary)"
              })}
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <item.icon size={22} className={isActive ? "" : "opacity-70"} />
                  <span className={`font-medium ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink
              to="/admin/users"
              end={false}
              className={({ isActive }: { isActive: boolean }) =>
                `flex items-center gap-4 px-5 py-3.5 rounded-r-full transition-all group mt-4 ${isActive
                  ? "bg-red-500/10 text-red-600 shadow-sm"
                  : "hover:bg-red-500/5 text-red-500"
                }`
              }
            >
              {({ isActive }: { isActive: boolean }) => (
                <>
                  <Shield size={22} className={isActive ? "" : "opacity-70"} />
                  <span className={`font-medium ${isActive ? "font-semibold" : ""}`}>Access Management</span>
                </>
              )}
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t" style={{ borderColor: "var(--color-border)" }}>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            className="w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold"
          >
            <LogOut size={22} className="opacity-80" />
            <span className="font-display uppercase tracking-widest text-xs">Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className={`flex-1 transition-all duration-300 pt-[64px] ${sidebarOpen ? "md:ml-[260px]" : "ml-0"}`}>
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile Scrim */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 dark:bg-black/40 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Overlay to close dropdowns */}
      {(notifOpen || profileOpen || searchFocused) && (
        <div className="fixed inset-0 z-30" onClick={() => { setNotifOpen(false); setProfileOpen(false); setSearchFocused(false); setSearchQuery(""); }} />
      )}
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 z-[100] animate-slide-in-right">
          <div className="glass-card p-4 flex items-start gap-4 shadow-2xl border-l-4 border-l-[#264796] min-w-[300px] cursor-pointer"
            onClick={() => { navigate(toast.href); setToast(null); }}
            style={{ background: "var(--color-surface-base)", backdropFilter: "blur(20px)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(38, 71, 150, 0.12)" }}>
              <Bell size={20} className="text-[#264796]" />
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <p className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>{toast.title}</p>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{toast.desc}</p>
            </div>
            <button onClick={() => setToast(null)} className="absolute top-2 right-2 p-1 hover:bg-black/5 rounded-full transition-colors">
              <X size={14} style={{ color: "var(--color-text-muted)" }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
