import { FormEvent, useCallback, useEffect, useState } from "react";
import { ActionRow, Admin, AdminRow, ApiError, College, api, setCsrf } from "./api";

type Tab = "colleges" | "admins" | "activity";

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "never");

function Badge({ tone, children }: { tone: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ csrf: string }>("/staff/login/", { method: "POST", body: { username, password } });
      setCsrf(res.csrf);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3">
          <img src="/eduai_logo.png" alt="" className="h-10 w-10 rounded-lg" />
          <div>
            <h1 className="text-lg font-bold">EduAI Owner Console</h1>
            <p className="muted text-sm">Sign in to manage colleges</p>
          </div>
        </div>
        <label className="block text-sm font-medium">Username
          <input className="field mt-1" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label className="block text-sm font-medium">Password
          <input className="field mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)" }}>{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !username || !password}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  );
}

function Loading({ error, retry }: { error: string; retry: () => void }) {
  return error
    ? <div className="card p-6"><p role="alert">{error}</p><button className="btn mt-3" onClick={retry}>Try again</button></div>
    : <p className="muted p-6">Loading...</p>;
}

function Colleges({ open }: { open: (slug: string) => void }) {
  const [colleges, setColleges] = useState<College[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    setError("");
    api<{ campuses: College[] }>("/staff/admins/").then((d) => setColleges(d.campuses)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  if (!colleges) return <Loading error={error} retry={load} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Colleges</h2>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add a college</button>
      </div>
      {adding && <AddCollege onClose={() => setAdding(false)} onAdded={(slug) => { setAdding(false); open(slug); }} />}
      {colleges.length === 0 && !adding && <p className="card muted p-6 text-sm">No colleges yet. Add the first one to start managing its Master Admins.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {colleges.map((c) => (
          <button key={c.slug} onClick={() => open(c.slug)} className="card p-4 text-left transition hover:border-[var(--brand)]">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{c.college_name}</h3>
              <Badge tone={c.status === "active" ? "ok" : c.status === "suspended" ? "bad" : "warn"}>{c.status}</Badge>
            </div>
            <p className="muted mt-1 text-xs">{c.slug}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div><dt className="muted text-xs">Admins</dt><dd className="font-semibold">{c.summary.admins ?? "-"}</dd></div>
              <div><dt className="muted text-xs">Teachers</dt><dd className="font-semibold">{c.summary.teachers ?? "-"}</dd></div>
              <div><dt className="muted text-xs">Students</dt><dd className="font-semibold">{c.summary.students ?? "-"}</dd></div>
            </dl>
            <p className="mt-3 text-xs">
              {c.has_channel ? <Badge tone="ok">Locked channel set</Badge> : <Badge tone="warn">No channel key</Badge>}
              <span className="muted ml-2">{c.snapshot_at ? `checked ${when(c.snapshot_at)}` : "never reached"}</span>
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AddCollege({ onClose, onAdded }: { onClose: () => void; onAdded: (slug: string) => void }) {
  const [form, setForm] = useState({ college_name: "", slug: "", api_url: "", channel_secret: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/staff/campuses/", { method: "POST", body: { ...form, slug: form.slug.trim().toLowerCase() } });
      onAdded(form.slug.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the college.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-sm font-medium">College name<input className="field mt-1" value={form.college_name} onChange={set("college_name")} required /></label>
      <label className="text-sm font-medium">Short name (used in addresses)<input className="field mt-1" value={form.slug} onChange={set("slug")} placeholder="e.g. svu" required /></label>
      <label className="text-sm font-medium">Its API address<input className="field mt-1" value={form.api_url} onChange={set("api_url")} placeholder="https://api.svu.example.edu" /></label>
      <label className="text-sm font-medium">Channel key (from its server settings)<input className="field mt-1" type="password" autoComplete="off" value={form.channel_secret} onChange={set("channel_secret")} /></label>
      {error && <p role="alert" className="text-sm sm:col-span-2" style={{ color: "var(--bad-fg)" }}>{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Adding..." : "Add college"}</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

interface AdminsResponse { campus: College; admins: Admin[]; stale: boolean; error: string; as_of?: string | null; }

function CollegeDetail({ slug, back }: { slug: string; back: () => void }) {
  const [data, setData] = useState<AdminsResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  const [link, setLink] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [replacing, setReplacing] = useState(false);
  const load = useCallback(() => {
    setError("");
    api<AdminsResponse>(`/staff/campuses/${slug}/admins/`).then((d) => { setData(d); setApiUrl(d.campus.api_url); }).catch((e) => setError(e.message));
  }, [slug]);
  useEffect(load, [load]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    setLink("");
    try { await work(); } catch (err) { setNotice(err instanceof Error ? err.message : "Something went wrong."); } finally { setBusy(false); }
  };

  const act = (admin: Admin, action: "disable" | "enable" | "reset-link") => run(async () => {
    const verb = { disable: "Disable", enable: "Enable", "reset-link": "Send a password link to" }[action];
    if (!window.confirm(`${verb} ${admin.email}?`)) return;
    let force = false;
    try {
      const res = await api<{ set_password_link?: string; emailed?: boolean }>(`/staff/campuses/${slug}/admins/${admin.id}/${action}/`, { method: "POST", body: {} });
      if (res.set_password_link) setLink(res.set_password_link);
      setNotice(action === "reset-link" ? (res.emailed ? "Password link emailed." : "The college cannot send email, so pass this link on yourself.") : `${admin.email} ${action === "disable" ? "disabled" : "enabled"}.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && action === "disable") {
        force = window.confirm(`${err.message}\n\nThis leaves the college with nobody able to run it until you invite someone. Disable anyway?`);
        if (!force) return;
        await api(`/staff/campuses/${slug}/admins/${admin.id}/disable/`, { method: "POST", body: { force: true } });
        setNotice(`${admin.email} disabled.`);
      } else throw err;
    }
    load();
  });

  const sendInvite = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const res = await api<{ emailed: boolean; set_password_link?: string }>(`/staff/campuses/${slug}/admins/`, { method: "POST", body: { email: invite } });
      setNotice(res.emailed ? `Invitation emailed to ${invite}.` : "Account created. The college cannot send email, so pass the link below on yourself.");
      setLink(res.set_password_link ?? "");
      setInvite("");
      load();
    });
  };

  const saveChannel = () => run(async () => {
    await api(`/staff/campuses/${slug}/`, { method: "PATCH", body: { api_url: apiUrl, ...(secret ? { channel_secret: secret } : {}) } });
    setSecret("");
    setReplacing(false);
    const res = await api<{ ok: boolean; detail?: string }>(`/staff/campuses/${slug}/test-connection/`, { method: "POST", body: {} });
    setNotice(res.ok ? "Saved. The college answered: the locked channel works." : `Saved, but the test failed: ${res.detail}`);
    load();
  });

  if (!data) return <div className="space-y-3"><button className="btn" onClick={back}>Back</button><Loading error={error} retry={load} /></div>;
  const { campus } = data;
  return (
    <div className="space-y-4">
      <button className="btn" onClick={back}>Back to colleges</button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{campus.college_name}</h2>
        <Badge tone={campus.status === "active" ? "ok" : campus.status === "suspended" ? "bad" : "warn"}>{campus.status}</Badge>
      </div>
      {notice && <p role="status" className="card p-3 text-sm">{notice}</p>}
      {link && (
        <div className="card space-y-2 p-3 text-sm">
          <p className="font-semibold">One-time password link (shown once, works for 3 days)</p>
          <input readOnly className="field" value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn" onClick={() => setLink("")}>Done, hide it</button>
        </div>
      )}
      {data.stale && (
        <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
          {data.error} {data.as_of ? `Showing the list as it was on ${when(data.as_of)}.` : "There is no earlier list to show."}
        </p>
      )}

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between p-4"><h3 className="font-semibold">Master Admins</h3></div>
        {data.admins.length === 0 ? <p className="muted px-4 pb-4 text-sm">{data.stale ? "Nothing known yet." : "No Master Admins. Invite one below."}</p> : (
          <table className="w-full min-w-[560px]">
            <thead><tr><th>Email</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {data.admins.map((a) => (
                <tr key={a.id}>
                  <td>{a.email}{a.name && <span className="muted"> · {a.name}</span>}</td>
                  <td>{a.active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</td>
                  <td className="muted">{when(a.last_login)}</td>
                  <td className="space-x-2 text-right">
                    {a.active && <button className="btn" disabled={busy || data.stale} onClick={() => act(a, "reset-link")}>Send password link</button>}
                    {a.active
                      ? <button className="btn btn-danger" disabled={busy || data.stale} onClick={() => act(a, "disable")}>Disable</button>
                      : <button className="btn" disabled={busy || data.stale} onClick={() => act(a, "enable")}>Enable</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={sendInvite} className="flex flex-wrap gap-2 border-t p-4" style={{ borderColor: "var(--line)" }}>
          <input className="field max-w-xs" type="email" placeholder="New Master Admin's email" value={invite} onChange={(e) => setInvite(e.target.value)} required />
          <button className="btn btn-primary" disabled={busy || data.stale || !invite}>Invite</button>
        </form>
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="font-semibold">Locked channel</h3>
        <p className="muted text-sm">The key is stored encrypted here and never shown again. It must match <code>VENDOR_CHANNEL_SECRET</code> in this college's server settings.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Its API address<input className="field mt-1" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.college.example.edu" /></label>
          {campus.has_channel && !replacing
            ? <div className="text-sm font-medium">Channel key<p className="muted mt-1 font-normal">Stored. <button type="button" className="underline" onClick={() => setReplacing(true)}>Replace it</button></p></div>
            : (
              <label className="text-sm font-medium">New channel key
                {/* Plain text field drawn as dots: browsers never offer a saved password for it. */}
                <input className="field mt-1" type="text" autoComplete="off" name="vendor-channel-key" spellCheck={false} data-1p-ignore data-lpignore="true" style={{ WebkitTextSecurity: "disc" } as React.CSSProperties} value={secret} onChange={(e) => setSecret(e.target.value)} />
              </label>
            )}
        </div>
        <button className="btn" disabled={busy} onClick={saveChannel}>Save and test connection</button>
        {campus.summary.version && (
          <p className="muted text-sm">Last reached {when(campus.snapshot_at)} · version {campus.summary.version} · {campus.summary.students ?? 0} students · {campus.summary.teachers ?? 0} teachers{campus.summary.email_configured === false && " · the college has no email set up"}</p>
        )}
      </section>
    </div>
  );
}

function AllAdmins({ open }: { open: (slug: string) => void }) {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState("");
  const [college, setCollege] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(() => {
    setError("");
    api<{ admins: AdminRow[] }>("/staff/admins/").then((d) => setRows(d.admins)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  if (!rows) return <Loading error={error} retry={load} />;
  const colleges = [...new Map(rows.map((r) => [r.campus_slug, r.college_name])).entries()];
  const shown = rows.filter((r) => (!college || r.campus_slug === college) && (!status || (status === "active") === r.active));
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Master Admins across all colleges</h2>
      <p className="muted text-sm">From the last time each college was reached. Open a college to see it live and make changes.</p>
      <div className="flex flex-wrap gap-2">
        <select className="field max-w-xs" value={college} onChange={(e) => setCollege(e.target.value)} aria-label="Filter by college">
          <option value="">All colleges</option>
          {colleges.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
        <select className="field max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option><option value="active">Active</option><option value="disabled">Disabled</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        {shown.length === 0 ? <p className="muted p-6 text-sm">No Master Admins to show.</p> : (
          <table className="w-full min-w-[560px]">
            <thead><tr><th>Email</th><th>College</th><th>Status</th><th>Last sign-in</th><th>List from</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.campus_slug}-${r.id}`}>
                  <td>{r.email}</td>
                  <td><button className="underline" onClick={() => open(r.campus_slug)}>{r.college_name}</button></td>
                  <td>{r.active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Disabled</Badge>}</td>
                  <td className="muted">{when(r.last_login)}</td>
                  <td className="muted">{when(r.as_of)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Activity() {
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<ActionRow[]>("/staff/actions/").then(setRows).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  if (!rows) return <Loading error={error} retry={load} />;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Activity</h2>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <p className="muted p-6 text-sm">Nothing done yet. Invites, disables and password links appear here.</p> : (
          <table className="w-full min-w-[640px]">
            <thead><tr><th>When</th><th>College</th><th>Action</th><th>Who</th><th>Result</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{when(r.at)}</td>
                  <td>{r.college_name}</td>
                  <td>{r.action.replace("-", " ")}{r.target_email && <span className="muted"> · {r.target_email}</span>}</td>
                  <td>{r.staff}</td>
                  <td><Badge tone={r.result === "ok" ? "ok" : r.result === "refused" ? "warn" : "bad"}>{r.result}</Badge>{r.detail && <span className="muted ml-2 text-xs">{r.detail}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("colleges");
  const [college, setCollege] = useState<string | null>(null);

  const check = useCallback(() => {
    api<{ username: string; csrf: string }>("/staff/me/")
      .then((me) => { setCsrf(me.csrf); setUser(me.username); })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);
  useEffect(check, [check]);

  if (checking) return <p className="muted p-6">Checking your session...</p>;
  if (!user) return <Login onDone={check} />;

  const go = (next: Tab) => { setTab(next); setCollege(null); };
  const openCollege = (slug: string) => { setTab("colleges"); setCollege(slug); };
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <img src="/eduai_logo.png" alt="" className="h-9 w-9 rounded-lg" />
          <span className="font-bold">EduAI Owner Console</span>
        </div>
        <nav className="flex gap-1" aria-label="Sections">
          {([["colleges", "Colleges"], ["admins", "Master Admins"], ["activity", "Activity"]] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => go(key)} aria-current={tab === key} className={`btn ${tab === key ? "btn-primary" : ""}`}>{label}</button>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="muted">{user}</span>
          <button className="btn" onClick={() => api("/staff/logout/", { method: "POST", body: {} }).finally(() => setUser(null))}>Sign out</button>
        </div>
      </header>
      <main>
        {tab === "colleges" && (college ? <CollegeDetail slug={college} back={() => setCollege(null)} /> : <Colleges open={setCollege} />)}
        {tab === "admins" && <AllAdmins open={openCollege} />}
        {tab === "activity" && <Activity />}
      </main>
    </div>
  );
}
