import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronRight,
  GraduationCap,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import logo from "../../logo/eduai_logo.png";
import { API_ENDPOINTS, authHeaders } from "./shared/apiConfig";

interface AdminUser {
  id: number;
  email: string;
  name?: string;
  role: string;
}

interface Overview {
  institution: Record<string, number>;
  classrooms: number;
  users: Record<string, number>;
}

interface Campus {
  id: number;
  name: string;
  code: string;
  city: string;
  state?: string;
  address?: string;
  schools: number;
  departments: number;
  students: number;
  is_active: boolean;
}

interface DirectoryUser {
  id: number;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  role: string;
  register_no?: string;
  emp_no?: string;
  is_active: boolean;
  campus?: { id: number; name: string } | null;
}

interface DeletedItem {
  id: number;
  content_type: string;
  label: string;
  deleted_at: string;
}

const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("lastActivity");
};

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error?.message || "Request failed.");
  }
  return data as T;
}

function LoginScreen({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your email, employee number, or password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<{ access: string; user: AdminUser }>(
        `${API_ENDPOINTS.AUTH}/login/`,
        {
          method: "POST",
          body: JSON.stringify({ username: username.trim(), password }),
        },
      );
      if (data.user.role !== "admin" && data.user.role !== "MASTER_ADMIN") {
        throw new Error("Access denied. Master Admin privileges are required.");
      }
      localStorage.setItem("token", data.access);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("lastActivity", Date.now().toString());
      onLogin(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-950 px-6 text-stone-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-stone-800 bg-stone-900 p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <img src={logo} alt="EduAI Suite" className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
          <div>
            <h1 className="text-xl font-bold">Master Admin</h1>
            <p className="text-sm text-stone-400">Sign in to continue</p>
          </div>
        </div>
        {error && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <label className="mb-4 block text-sm text-stone-300">
          Email or employee number
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-white outline-none focus:border-amber-400" />
        </label>
        <label className="mb-6 block text-sm text-stone-300">
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-3 text-white outline-none focus:border-amber-400" />
        </label>
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
      <p>{message}</p>
      <button onClick={onRetry} className="mt-4 rounded-lg border border-rose-400/40 px-3 py-2 text-sm hover:bg-rose-500/20">Retry</button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "campuses" | "users" | "recycle_bin">("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"campus" | "user" | null>(null);
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthLoading(false);
      return;
    }
    requestJson<{ user: AdminUser }>(`${API_ENDPOINTS.AUTH}/me/`)
      .then((data) => {
        if (data.user.role !== "admin" && data.user.role !== "MASTER_ADMIN") {
          throw new Error("Access denied.");
        }
        setUser(data.user);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewData, campusData, userData, recycleData] = await Promise.all([
        requestJson<Overview>(`${API_ENDPOINTS.MASTER_ADMIN}/overview/`),
        requestJson<{ results: Campus[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/campuses/`),
        requestJson<{ results: DirectoryUser[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/users/`),
        requestJson<{ results: DeletedItem[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/recycle-bin/`),
      ]);
      setOverview(overviewData);
      setCampuses(campusData.results);
      setDirectoryUsers(userData.results);
      setDeletedItems(recycleData.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load administration data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-stone-950 text-stone-300">Checking session...</div>;
  if (!user) return <LoginScreen onLogin={setUser} />;
  if (error && !overview) return <div className="min-h-screen bg-stone-950 p-8 text-stone-100"><ErrorState message={error} onRetry={() => void loadData()} /></div>;

  const refresh = () => void loadData();
  const logout = () => {
    clearSession();
    setUser(null);
  };
  const filteredCampuses = campuses.filter((campus) => `${campus.name} ${campus.code} ${campus.city}`.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredUsers = directoryUsers.filter((directoryUser) => `${directoryUser.name} ${directoryUser.email} ${directoryUser.role} ${directoryUser.campus?.name || ""}`.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex min-h-screen bg-stone-950 text-stone-100">
      <aside className="w-72 glass-panel border-r border-stone-800/80 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-900/30"><img src={logo} alt="EduAI Suite" className="h-8 w-8 object-contain" /></div>
            <div><h1 className="font-bold text-lg text-white">EduAI Suite</h1><span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">Master Admin</span></div>
          </div>
          <nav className="space-y-1.5">
            {[
              { tab: "overview" as const, label: "Overview & Analytics", Icon: BarChart3, color: "text-amber-400" },
              { tab: "campuses" as const, label: "Campus Governance", Icon: Building2, color: "text-emerald-400" },
              { tab: "users" as const, label: "Global User Directory", Icon: Users, color: "text-sky-400" },
              { tab: "recycle_bin" as const, label: "Universal Recycle Bin", Icon: Trash2, color: "text-rose-400" },
            ].map(({ tab, label, Icon, color }) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${activeTab === tab ? "bg-stone-800 text-white shadow-md border border-stone-700/60" : "text-stone-400 hover:text-white hover:bg-stone-900/60"}`}>
                <Icon className={`h-4 w-4 ${color}`} />{label}
              </button>
            ))}
          </nav>
        </div>
        <div className="glass-card p-4 rounded-xl border border-stone-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Backend connected</div>
          <p className="text-[11px] text-stone-400 truncate">{user.email}</p>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex items-center justify-between mb-8 gap-4">
          <div><h2 className="text-2xl font-bold tracking-tight text-white capitalize">{activeTab.replace("_", " ")}</h2><p className="text-sm text-stone-400 mt-1">Cross-campus administration and governance</p></div>
          <div className="flex items-center gap-3">
            <div className="relative"><Search className="h-4 w-4 absolute left-3.5 top-3 text-stone-400" /><input type="text" placeholder="Search current view..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="bg-stone-900/80 border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-stone-600 w-64" /></div>
            <button onClick={refresh} disabled={loading} className="rounded-xl border border-stone-700 p-2 text-stone-300 hover:text-white disabled:opacity-50" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            <button onClick={logout} className="flex items-center gap-2 rounded-xl border border-stone-700 px-3 py-2 text-sm text-stone-300 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </header>
        {error && <div className="mb-6"><ErrorState message={error} onRetry={refresh} /></div>}

        {activeTab === "overview" && overview && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { label: "Campuses", value: overview.institution.campuses, Icon: Building2 },
                { label: "Students", value: overview.users.students, Icon: GraduationCap },
                { label: "Teachers", value: overview.users.teachers, Icon: Users },
                { label: "Classrooms", value: overview.classrooms, Icon: BarChart3 },
              ].map(({ label, value, Icon }) => <div key={label} className="glass-card p-5 rounded-2xl"><div className="flex items-center justify-between text-stone-400 mb-3"><span className="text-xs font-semibold uppercase tracking-wider">{label}</span><Icon className="h-4 w-4 text-amber-400" /></div><div className="text-3xl font-bold text-white">{value}</div><div className="text-xs text-emerald-400 font-medium mt-2">Live database count</div></div>)}
            </div>
            <section className="glass-card p-6 rounded-2xl"><div className="flex items-center justify-between mb-4"><h3 className="font-semibold">Campus snapshot</h3><button onClick={() => setActiveTab("campuses")} className="text-sm text-amber-300 flex items-center gap-1">Open governance <ChevronRight className="h-4 w-4" /></button></div><div className="grid grid-cols-1 md:grid-cols-3 gap-3">{campuses.slice(0, 6).map((campus) => <div key={campus.id} className="rounded-xl bg-stone-900/60 border border-stone-800 p-4"><p className="font-semibold">{campus.name}</p><p className="text-xs text-stone-400 mt-1">{campus.code} · {campus.students} students</p></div>)}</div></section>
          </div>
        )}

        {activeTab === "campuses" && <CampusPanel campuses={filteredCampuses} onCreate={() => { setEditingCampus(null); setModal("campus"); }} onEdit={(campus) => { setEditingCampus(campus); setModal("campus"); }} onRefresh={refresh} />}
        {activeTab === "users" && <UserPanel users={filteredUsers} onCreate={() => { setEditingUser(null); setModal("user"); }} onEdit={(directoryUser) => { setEditingUser(directoryUser); setModal("user"); }} onRefresh={refresh} />}
        {activeTab === "recycle_bin" && <RecycleBinPanel items={deletedItems.filter((item) => `${item.label} ${item.content_type}`.toLowerCase().includes(searchQuery.toLowerCase()))} onRefresh={refresh} />}

        {modal === "campus" && <CampusForm campus={editingCampus} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
        {modal === "user" && <UserForm user={editingUser} campuses={campuses} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      </main>
    </div>
  );
}

function CampusPanel({ campuses, onCreate, onEdit, onRefresh }: { campuses: Campus[]; onCreate: () => void; onEdit: (campus: Campus) => void; onRefresh: () => void }) {
  const deactivate = async (campus: Campus) => {
    if (!window.confirm(`Deactivate ${campus.name}? Its hierarchy will be soft-deleted.`)) return;
    await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/campuses/${campus.id}/`, { method: "DELETE" });
    onRefresh();
  };
  return <section className="glass-card p-6 rounded-2xl space-y-5"><div className="flex justify-between items-center"><div><h3 className="text-base font-semibold">Campus Governance</h3><p className="text-xs text-stone-400 mt-1">Campus-level mutations; lower hierarchy levels remain read-only.</p></div><button onClick={onCreate} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500"><Plus className="h-4 w-4" />New Campus</button></div><div className="overflow-x-auto rounded-xl border border-stone-800"><table className="w-full text-left text-sm"><thead className="bg-stone-900 text-xs uppercase text-stone-400"><tr><th className="p-4">Campus</th><th className="p-4">City</th><th className="p-4">Schools</th><th className="p-4">Departments</th><th className="p-4">Students</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-stone-800">{campuses.map((campus) => <tr key={campus.id} className="hover:bg-stone-900/40"><td className="p-4"><p className="font-semibold">{campus.name}</p><p className="text-xs text-stone-500">{campus.code}</p></td><td className="p-4 text-stone-300">{campus.city}</td><td className="p-4">{campus.schools}</td><td className="p-4">{campus.departments}</td><td className="p-4">{campus.students}</td><td className="p-4 text-right"><button onClick={() => onEdit(campus)} className="mr-3 text-amber-300 hover:text-amber-200">Edit</button><button onClick={() => void deactivate(campus)} className="text-rose-300 hover:text-rose-200">Deactivate</button></td></tr>)}</tbody></table>{!campuses.length && <p className="p-8 text-center text-stone-500">No campuses match this search.</p>}</div></section>;
}

function UserPanel({ users, onCreate, onEdit, onRefresh }: { users: DirectoryUser[]; onCreate: () => void; onEdit: (user: DirectoryUser) => void; onRefresh: () => void }) {
  const deactivate = async (user: DirectoryUser) => {
    if (!window.confirm(`Deactivate ${user.name || user.email}?`)) return;
    await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/users/${user.id}/`, { method: "DELETE" });
    onRefresh();
  };
  return <section className="glass-card p-6 rounded-2xl space-y-5"><div className="flex justify-between items-center"><div><h3 className="text-base font-semibold">Global User Directory</h3><p className="text-xs text-stone-400 mt-1">Search and manage active users across campuses.</p></div><button onClick={onCreate} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500"><Plus className="h-4 w-4" />New User</button></div><div className="overflow-x-auto rounded-xl border border-stone-800"><table className="w-full text-left text-sm"><thead className="bg-stone-900 text-xs uppercase text-stone-400"><tr><th className="p-4">User</th><th className="p-4">Role</th><th className="p-4">Campus</th><th className="p-4">Identifiers</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-stone-800">{users.map((user) => <tr key={user.id} className="hover:bg-stone-900/40"><td className="p-4"><p className="font-semibold">{user.name || user.email}</p><p className="text-xs text-stone-500">{user.email}</p></td><td className="p-4 text-stone-300">{user.role}</td><td className="p-4 text-stone-300">{user.campus?.name || "Unassigned"}</td><td className="p-4 text-xs text-stone-400">{user.register_no || user.emp_no || "—"}</td><td className="p-4 text-right"><button onClick={() => onEdit(user)} className="mr-3 text-amber-300 hover:text-amber-200">Edit</button><button onClick={() => void deactivate(user)} className="text-rose-300 hover:text-rose-200">Deactivate</button></td></tr>)}</tbody></table>{!users.length && <p className="p-8 text-center text-stone-500">No users match this search.</p>}</div></section>;
}

function RecycleBinPanel({ items, onRefresh }: { items: DeletedItem[]; onRefresh: () => void }) {
  const restore = async (item: DeletedItem) => {
    if (!window.confirm(`Restore ${item.label}?`)) return;
    await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/recycle-bin/${item.content_type}/${item.id}/restore/`, { method: "POST" });
    onRefresh();
  };
  return <section className="glass-card p-6 rounded-2xl space-y-5"><div><h3 className="text-base font-semibold flex items-center gap-2"><Trash2 className="h-5 w-5 text-rose-400" />Universal Recycle Bin</h3><p className="text-xs text-stone-400 mt-1">Soft-deleted records can be restored without hard deletion.</p></div><div className="overflow-x-auto rounded-xl border border-stone-800"><table className="w-full text-left text-sm"><thead className="bg-stone-900 text-xs uppercase text-stone-400"><tr><th className="p-4">Entity</th><th className="p-4">Resource</th><th className="p-4">Deleted</th><th className="p-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-stone-800">{items.map((item) => <tr key={`${item.content_type}-${item.id}`}><td className="p-4 text-xs text-stone-400">{item.content_type}</td><td className="p-4 font-medium">{item.label}</td><td className="p-4 text-xs text-stone-400">{new Date(item.deleted_at).toLocaleString()}</td><td className="p-4 text-right"><button onClick={() => void restore(item)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10"><RefreshCw className="h-3 w-3" />Restore</button></td></tr>)}</tbody></table>{!items.length && <p className="p-8 text-center text-stone-500">Recycle bin is empty.</p>}</div></section>;
}

function CampusForm({ campus, onClose, onSaved }: { campus: Campus | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: campus?.name || "", code: campus?.code || "", city: campus?.city || "", state: campus?.state || "Karnataka", address: campus?.address || "" });
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await requestJson(campus ? `${API_ENDPOINTS.MASTER_ADMIN}/campuses/${campus.id}/` : `${API_ENDPOINTS.MASTER_ADMIN}/campuses/`, { method: campus ? "PUT" : "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save campus."); }
  };
  return <Modal title={campus ? "Edit Campus" : "New Campus"} onClose={onClose}><form onSubmit={submit} className="space-y-4">{error && <p className="text-sm text-rose-300">{error}</p>}{(["name", "code", "city", "state", "address"] as const).map((field) => <label key={field} className="block text-sm text-stone-300">{field[0].toUpperCase() + field.slice(1)}<input required={field !== "address"} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white" /></label>)}<SubmitButtons onClose={onClose} /></form></Modal>;
}

function UserForm({ user, campuses, onClose, onSaved }: { user: DirectoryUser | null; campuses: Campus[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ email: user?.email || "", password: "", first_name: user?.first_name || "", last_name: user?.last_name || "", role: user?.role || "STUDENT", campus: user?.campus?.id ? String(user.campus.id) : "" });
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await requestJson(user ? `${API_ENDPOINTS.MASTER_ADMIN}/users/${user.id}/` : `${API_ENDPOINTS.MASTER_ADMIN}/users/`, { method: user ? "PATCH" : "POST", body: JSON.stringify({ ...form, campus: form.campus ? Number(form.campus) : null }) });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save user."); }
  };
  return <Modal title={user ? "Edit User" : "New User"} onClose={onClose}><form onSubmit={submit} className="space-y-4">{error && <p className="text-sm text-rose-300">{error}</p>}<input required={!user} placeholder="Email" type="email" value={form.email} disabled={Boolean(user)} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white disabled:opacity-50" />{!user && <input required placeholder="Temporary password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white" />}<input placeholder="First name" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white" /><input placeholder="Last name" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white" /><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white">{["STUDENT", "TEACHER", "CAMPUS_ADMIN", "MASTER_ADMIN"].map((role) => <option key={role}>{role}</option>)}</select><select value={form.campus} onChange={(event) => setForm({ ...form, campus: event.target.value })} className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-white"><option value="">No campus</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select><SubmitButtons onClose={onClose} /></form></Modal>;
}

function SubmitButtons({ onClose }: { onClose: () => void }) {
  return <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300">Cancel</button><button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Save</button></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl border border-stone-700 bg-stone-900 p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3><button onClick={onClose} className="text-stone-400 hover:text-white">✕</button></div>{children}</div></div>;
}
