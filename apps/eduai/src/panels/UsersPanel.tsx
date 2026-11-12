import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTerms } from "../shared/university";
import { Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { API_BASE_URL, API_ENDPOINTS } from "../shared/apiConfig";
import { requestJson } from "../shared/request";
import { Campus, DirectoryUser } from "../types";
import { Avatar, Badge, Chips, EmptyState, ErrorState, Modal, PanelCard, PanelHeader, PrimaryButton, SkeletonRows, TableShell, Th, inputClass, useConfirm, useToast } from "../ui";

const ROLE_FILTERS = [["", "All roles"], ["STUDENT", "Students"], ["TEACHER", "Teachers"], ["MASTER_ADMIN", "Master admins"]] as const;
const STATUS_FILTERS = [["true", "Active"], ["false", "Deactivated"]] as const;
const ROLE_TONE: Record<string, "blue" | "violet" | "amber"> = { STUDENT: "blue", TEACHER: "violet", MASTER_ADMIN: "amber" };
const ROLE_LABEL: Record<string, string> = { STUDENT: "Student", TEACHER: "Teacher", MASTER_ADMIN: "Master admin" };

function UserForm({ user, campuses, onClose, onSaved }: { user: DirectoryUser | null; campuses: Campus[]; onClose: () => void; onSaved: () => void }) {
  const t = useTerms();
  const toast = useToast();
  const [form, setForm] = useState({
    email: user?.email ?? "", password: "", first_name: user?.first_name ?? "", last_name: user?.last_name ?? "",
    register_no: user?.register_no ?? "", emp_no: user?.emp_no ?? "", section: user?.section?.id ? String(user.section.id) : "",
    role: user?.role ?? "STUDENT", campus: user?.campus?.id ? String(user.campus.id) : "", department: user?.department?.id ? String(user.department.id) : "",
  });
  const [departments, setDepartments] = useState<{ id: number; label: string }[]>([]);
  const [teaching, setTeaching] = useState<number[]>(user?.teaching_programs ?? []);
  const [options, setOptions] = useState<{ sections: { id: number; label: string }[]; programs: { id: number; label: string; department: number }[] }>({ sections: [], programs: [] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    requestJson<typeof options>(`${API_ENDPOINTS.MASTER_ADMIN}/users/placement-options/`).then(setOptions).catch(() => setOptions({ sections: [], programs: [] }));
  }, [user]);

  useEffect(() => {
    requestJson<{ results: { id: number; name: string; school_detail?: { name: string; campus_detail?: { name: string } } }[] }>(`${API_BASE_URL}/institution/departments/?page_size=100`)
      .then((data) => setDepartments(data.results.map((d) => ({ id: d.id, label: [d.school_detail?.campus_detail?.name, d.school_detail?.name, d.name].filter(Boolean).join(" › ") }))))
      .catch(() => setDepartments([]));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await requestJson(user ? `${API_ENDPOINTS.MASTER_ADMIN}/users/${user.id}/` : `${API_ENDPOINTS.MASTER_ADMIN}/users/`, {
        method: user ? "PATCH" : "POST",
        body: JSON.stringify(user ? {
          ...form, register_no: form.register_no, emp_no: form.emp_no,
          campus: form.campus ? Number(form.campus) : null, department: form.department ? Number(form.department) : null,
          ...(form.role === "STUDENT" && form.section && Number(form.section) !== user.section?.id ? { section: Number(form.section) } : {}),
          ...(form.role === "TEACHER" ? { teaching_programs: teaching } : {}),
        } : { ...form, campus: form.campus ? Number(form.campus) : null, department: form.department ? Number(form.department) : null }),
      });
      toast.success(user ? "User updated." : "User created.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={user ? "Edit user" : "Add user"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2">{error}</p>}
        <label className="block text-sm text-slate-700 sm:col-span-2">Email
          <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} />
          {user && form.email.trim().toLowerCase() !== user.email && <span className="mt-1 block text-xs text-amber-800">This person will sign in with the new email from now on.</span>}
        </label>
        {!user && <label className="block text-sm text-slate-700 sm:col-span-2">Temporary password
          <input required type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={inputClass} />
        </label>}
        <label className="block text-sm text-slate-700">First name
          <input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm text-slate-700">Last name
          <input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm text-slate-700">Role
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={inputClass}>
            {["STUDENT", "TEACHER", "MASTER_ADMIN"].map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700">Campus
          <select value={form.campus} onChange={(event) => setForm({ ...form, campus: event.target.value })} className={inputClass}>
            <option value="">No campus</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700 sm:col-span-2">Department <span className="text-xs text-slate-500">(also sets the school and campus)</span>
          <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className={inputClass}>
            <option value="">No department</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}
          </select>
        </label>
        {user && form.role === "STUDENT" && <>
          <label className="block text-sm text-slate-700">{t('register_no')}
            <input value={form.register_no} onChange={(event) => setForm({ ...form, register_no: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm text-slate-700">Section <span className="text-xs text-slate-500">(sets class, program and department; the roster follows)</span>
            <select value={form.section} onChange={(event) => setForm({ ...form, section: event.target.value })} className={inputClass}>
              <option value="">{user.section ? "Keep " + user.section.name : "No section"}</option>
              {options.sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
          </label>
        </>}
        {user && form.role === "TEACHER" && <>
          <label className="block text-sm text-slate-700 sm:col-span-2">{t('employee_no')}
            <input value={form.emp_no} onChange={(event) => setForm({ ...form, emp_no: event.target.value })} className={inputClass} />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm text-slate-700">Programs taught <span className="text-xs text-slate-500">(from the teacher's department)</span></legend>
            {!form.department ? <p className="mt-1 text-xs text-slate-500">Choose a department to pick programs.</p> : <div className="mt-1 flex flex-wrap gap-2">
              {options.programs.filter((program) => program.department === Number(form.department)).map((program) => <label key={program.id} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800">
                <input type="checkbox" checked={teaching.includes(program.id)} onChange={(event) => setTeaching(event.target.checked ? [...teaching, program.id] : teaching.filter((id) => id !== program.id))} />{program.label}
              </label>)}
            </div>}
          </fieldset>
        </>}
        <div className="flex justify-end gap-3 pt-2 sm:col-span-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:text-slate-900">Cancel</button>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export function UsersPanel({ search, onChanged }: { search: string; onChanged: () => void }) {
  const t = useTerms();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<DirectoryUser[] | null>(null);
  const [count, setCount] = useState(0);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [role, setRole] = useState<(typeof ROLE_FILTERS)[number][0]>("");
  const [active, setActive] = useState<"true" | "false">("true");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<DirectoryUser | null | "new">(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const query = new URLSearchParams({ active, search: search.trim() });
      if (role) query.set("role", role);
      const data = await requestJson<{ results: DirectoryUser[]; count: number }>(`${API_ENDPOINTS.MASTER_ADMIN}/users/?${query}`);
      setUsers(data.results);
      setCount(data.count);
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : "Could not load users.");
    }
  }, [active, role, search]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 250); // wait while the admin is still typing
    return () => window.clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    requestJson<{ results: Campus[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/campuses/`).then((data) => setCampuses(data.results)).catch(() => setCampuses([]));
  }, []);

  const deactivate = async (user: DirectoryUser) => {
    const ok = await confirm({ title: `Deactivate ${user.name || user.email}?`, message: "They will no longer be able to sign in. You can restore the account at any time.", confirmLabel: "Deactivate", tone: "danger" });
    if (!ok) return;
    try {
      await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/users/${user.id}/`, { method: "DELETE" });
      toast.success("User deactivated.");
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate the user.");
    }
  };

  const restore = async (user: DirectoryUser) => {
    try {
      await requestJson(`${API_ENDPOINTS.MASTER_ADMIN}/users/${user.id}/`, { method: "POST" });
      toast.success(`${user.name || user.email} restored.`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore the user.");
    }
  };

  return (
    <PanelCard>
      <PanelHeader title="Users" subtitle={`Everyone with an account on the platform. Search by name, email, ${t("register_no", { lower: true })} or ${t("employee_no", { lower: true })}.`}
        actions={<PrimaryButton tone="sky" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add user</PrimaryButton>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips value={role} options={ROLE_FILTERS} onChange={setRole} />
        <Chips value={active} options={STATUS_FILTERS} onChange={setActive} />
      </div>
      {error && <div className="mb-4"><ErrorState message={error} onRetry={() => void load()} /></div>}
      {users === null ? <SkeletonRows rows={6} cols={5} /> : users.length === 0 ? (
        <EmptyState icon={<Users className="h-5 w-5" />} title="No users match" hint="Try a different search or filter." />
      ) : (
        <>
          <TableShell>
            <thead><tr><Th>User</Th><Th>Role</Th><Th>Placement</Th><Th>ID</Th><Th right>Actions</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/40">
                  <td className="p-3 sm:p-4"><div className="flex items-center gap-3"><Avatar name={user.name || user.email} /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{user.name || user.email}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div></div></td>
                  <td className="p-3 sm:p-4"><Badge tone={ROLE_TONE[user.role] ?? "stone"}>{ROLE_LABEL[user.role] ?? user.role}</Badge></td>
                  <td className="p-3 text-xs text-slate-700 sm:p-4">{user.department?.name ?? user.campus?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="p-3 text-xs text-slate-500 sm:p-4">{user.register_no || user.emp_no || "—"}</td>
                  <td className="p-3 text-right sm:p-4">
                    {user.is_active ? <>
                      <button onClick={() => setEditing(user)} className="mr-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-blue hover:bg-brand-blue/10"><Pencil className="h-3.5 w-3.5" />Edit</button>
                      <button onClick={() => void deactivate(user)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Deactivate</button>
                    </> : <button onClick={() => void restore(user)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-emerald-700 hover:bg-emerald-50"><RotateCcw className="h-3.5 w-3.5" />Restore</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          {count > users.length && <p className="mt-3 text-xs text-slate-500">Showing the first {users.length} of {count}. Narrow it down with the search box or filters.</p>}
        </>
      )}
      {editing && <UserForm user={editing === "new" ? null : editing} campuses={campuses} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); onChanged(); }} />}
    </PanelCard>
  );
}
