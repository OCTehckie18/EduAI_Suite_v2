import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, Gamepad2, LayoutDashboard, Clock, LogOut, ChevronRight, Menu, Calendar } from "lucide-react";
import logo from "../assets/logo (5).png";
import { useAuthStore } from "../store/useAuthStore";
import { useSessionTimeout } from "../shared/hooks/useSessionTimeout";

const studentNavItems = [
  { icon: LayoutDashboard, label: "My Dashboard", href: "/", end: true },
  { icon: BookOpen, label: "My Classrooms", href: "/classroom" },
  { icon: Clock, label: "Upcoming Exams", href: "/exams" },
  { icon: Gamepad2, label: "EduGames", href: "/games" },
  { icon: Calendar, label: "My Calendar", href: "/calendar" },
  { icon: Clock, label: "Appointments", href: "/appointments" }, // Clock or Calendar? It uses Calendar but we used it for My Calendar
];

export const StudentShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const { logout, role } = useAuthStore();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  const remainingTime = useSessionTimeout(900000);

  useEffect(() => {
    if (!role) {
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
    <div className="flex min-h-screen" style={{ background: "var(--color-surface-base)" }}>
      {/* ── Sidebar ── */}
      <aside className={`glass-sidebar flex flex-col fixed h-full z-50 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-[72px]"}`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/8">
          <div className="shrink-0 w-9 h-9 rounded-xl overflow-hidden bg-white flex items-center justify-center shadow-lg" onClick={() => setSidebarOpen(s => !s)}>
            <img src={logo} alt="Christ University" className="w-full h-full object-contain p-0.5" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-white font-bold text-[13px] leading-tight whitespace-nowrap font-display">EduGames Portal</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-widest whitespace-nowrap" style={{ color: "var(--color-brand-gold)" }}>Student View</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {studentNavItems.map((item) => (
            <NavLink key={item.href} to={item.href} end={item.end} className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? "nav-item-active" : ""}`}>
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
      <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-[72px]"}`}>
        <header className="sticky top-0 z-40 h-[70px] flex items-center justify-between px-6 gap-4" style={{ background: "var(--color-header-bg)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)} className="p-2 rounded-lg transition-colors text-slate-400 hover:text-blue-700 hover:bg-blue-50">
              <Menu size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Session Timer */}
            <div className="hidden px-2 py-1 bg-red-500/10 text-red-600 rounded-md text-xs font-bold font-mono border border-red-500/20 shadow-sm" title="Session Timeout">
              {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}
            </div>

            {/* Profile */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(o => !o)}
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
                <div className="glass-card absolute right-0 top-12 w-52 z-50 overflow-hidden animate-fade-in py-1">
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{user?.name || "Student"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{user?.email || "student@christuniversity.in"}</p>
                    <span className="badge mt-2" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Student</span>
                  </div>
                  {/* {["View Profile", "Settings"].map(item => (
                     <button key={item} 
                       className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                       style={{ color: 'var(--color-text-secondary)' }}
                       onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-brand-blue)'; e.currentTarget.style.backgroundColor = 'var(--color-border)' }}
                       onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                     >
                       {item}
                     </button>
                   ))} */}

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

        <div className="p-6 min-h-[calc(100vh-70px)]">
          <Outlet />
        </div>
      </main>

      {/* Overlay to close dropdowns */}
      {profileOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
      )}
    </div>
  );
};
