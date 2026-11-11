import { useEffect, useState } from "react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { University, setUniversity } from "./shared/university";
import { PanelCard, useConfirm, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/rules/`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";

type Action = "end" | "warn" | "ignore";
interface Rules {
  exam: { events: Record<string, Action>; warnings_allowed: number; rules_text: string; reset_by: "teachers" | "admins" };
  signin: { methods: "both" | "google" | "password"; allowed_domains: string[]; session_minutes: number };
  accounts: { teacher_approval: "roster_and_manual" | "roster_only" | "domain_auto"; student_can_edit: { name: boolean; phone: boolean; password: boolean } };
  risk: { safe_mark: number; floor_mark: number; weights: { marks: number; missing: number; trend: number; integrity: number } };
}

const EVENTS: [string, string][] = [
  ["tab_hidden", "Switching tabs or opening a new tab or window"],
  ["window_blur", "Switching windows or desktops"],
  ["fullscreen_exit", "Leaving full screen (Esc)"],
  ["page_unload", "Refreshing or closing the page"],
];
const ACTIONS: [Action, string][] = [["end", "Ends the exam"], ["warn", "Warning"], ["ignore", "Not counted"]];

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="mt-1 flex flex-wrap gap-2">
    {options.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${value === key ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 text-slate-700"}`}>{text}</button>)}
  </div>;
}

const numberValue = (raw: string) => (raw === "" ? NaN : Number(raw));

/** Exam, sign-in, account and risk rules for the whole university. */
export function RulesPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const [rules, setRules] = useState<Rules | null>(null);
  const [defaults, setDefaults] = useState<Rules | null>(null);
  const [domainsText, setDomainsText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const show = (data: { rules: Rules; defaults: Rules }) => {
    setRules(structuredClone(data.rules));
    setDefaults(data.defaults);
    setDomainsText(data.rules.signin.allowed_domains.join(", "));
  };

  const load = async () => {
    setError("");
    try {
      show(await requestJson<{ rules: Rules; defaults: Rules }>(ENDPOINT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the rules.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!rules || !defaults) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading rules...</p>;

  const set = <K extends keyof Rules>(group: K, patch: Partial<Rules[K]>) => setRules({ ...rules, [group]: { ...rules[group], ...patch } });
  const weightTotal = Object.values(rules.risk.weights).reduce((sum, value) => sum + (Number.isNaN(value) ? 0 : value), 0);

  const save = async () => {
    if (rules.signin.methods === "google" || rules.signin.methods === "password") {
      const other = rules.signin.methods === "google" ? "password" : "Google";
      const ok = await confirm({ title: `Switch off ${other} sign-in?`, message: `Teachers and students will no longer be able to sign in with ${other}. Master Admins can always sign in with a password, so you cannot lock yourself out.`, confirmLabel: "Save rules" });
      if (!ok) return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { ...rules, signin: { ...rules.signin, allowed_domains: domainsText } };
      const data = await requestJson<{ rules: Rules; defaults: Rules; university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(body) });
      show(data);
      setUniversity(data.university);
      toast.success("Rules saved. They apply straight away.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the rules.");
    } finally {
      setSaving(false);
    }
  };

  const resetGroup = (group: keyof Rules) => {
    setRules({ ...rules, [group]: structuredClone(defaults[group]) });
    if (group === "signin") setDomainsText(defaults.signin.allowed_domains.join(", "));
  };
  const resetButton = (group: keyof Rules) => <button type="button" onClick={() => resetGroup(group)} className="text-xs font-semibold text-brand-blue hover:underline">Back to the default</button>;

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

    <PanelCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Exams</h3>
          <p className="mt-1 text-xs text-slate-500">What happens when a student leaves an exam. By default every one ends the exam and is recorded as cheating.</p></div>
        {resetButton("exam")}
      </div>
      <div className="space-y-3">
        {EVENTS.map(([key, label]) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
          <span className="text-sm text-slate-800">{label}</span>
          <Choice label={label} value={rules.exam.events[key]} options={ACTIONS} onChange={(value) => set("exam", { events: { ...rules.exam.events, [key]: value } })} />
        </div>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">Warnings before the exam ends
          <input type="number" min={1} max={10} value={Number.isNaN(rules.exam.warnings_allowed) ? "" : rules.exam.warnings_allowed} onChange={(e) => set("exam", { warnings_allowed: numberValue(e.target.value) })} className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500">For anything set to "Warning": after this many warnings, the next one ends the exam.</span>
        </label>
        <div className="text-sm text-slate-700">Who can reset an attempt
          <Choice label="Who can reset an attempt" value={rules.exam.reset_by} options={[["teachers", "The class teacher"], ["admins", "Only the administration"]]} onChange={(value) => set("exam", { reset_by: value })} />
        </div>
      </div>
      <label className="block text-sm text-slate-700">Exam rules shown to students (optional)
        <textarea rows={4} maxLength={2000} value={rules.exam.rules_text} onChange={(e) => set("exam", { rules_text: e.target.value })} className={inputClass} placeholder="Leave empty to show rules written from the settings above. One rule per line." />
      </label>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Sign-in</h3>
          <p className="mt-1 text-xs text-slate-500">How teachers and students sign in. Master Admins can always sign in with a password.</p></div>
        {resetButton("signin")}
      </div>
      <div className="text-sm text-slate-700">Sign-in methods
        <Choice label="Sign-in methods" value={rules.signin.methods} options={[["both", "Google and password"], ["google", "Google only"], ["password", "Password only"]]} onChange={(value) => set("signin", { methods: value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">Allowed Google domains
          <input value={domainsText} onChange={(e) => setDomainsText(e.target.value)} placeholder="ctu.edu, staff.ctu.edu" className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500">Separate with commas. Subdomains are included. Empty allows any Google account.</span>
        </label>
        <label className="block text-sm text-slate-700">Sign people out after (minutes of inactivity)
          <input type="number" min={5} max={120} value={Number.isNaN(rules.signin.session_minutes) ? "" : rules.signin.session_minutes} onChange={(e) => set("signin", { session_minutes: numberValue(e.target.value) })} className={inputClass} />
        </label>
      </div>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Accounts</h3>
          <p className="mt-1 text-xs text-slate-500">How teachers get access, and what students may change about themselves.</p></div>
        {resetButton("accounts")}
      </div>
      <div className="text-sm text-slate-700">Teacher approval
        <Choice label="Teacher approval" value={rules.accounts.teacher_approval} options={[["roster_and_manual", "Teacher roster, others wait for approval"], ["roster_only", "Teacher roster only"], ["domain_auto", "Anyone from the allowed domains"]]} onChange={(value) => set("accounts", { teacher_approval: value })} />
        <span className="mt-1 block text-xs text-slate-500">"Anyone from the allowed domains" needs at least one allowed Google domain above.</span>
      </div>
      <fieldset className="text-sm text-slate-700"><legend>Students may change</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {([["name", "Their name"], ["phone", "Their phone number"], ["password", "Their password"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={rules.accounts.student_can_edit[key]} onChange={(e) => set("accounts", { student_can_edit: { ...rules.accounts.student_can_edit, [key]: e.target.checked } })} />{label}
          </label>)}
        </div>
      </fieldset>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Risk score</h3>
          <p className="mt-1 text-xs text-slate-500">How the at-risk score teachers see is worked out, out of 100.</p></div>
        {resetButton("risk")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">Safe mark (%)
          <input type="number" min={40} max={100} value={Number.isNaN(rules.risk.safe_mark) ? "" : rules.risk.safe_mark} onChange={(e) => set("risk", { safe_mark: numberValue(e.target.value) })} className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500">At or above this recent average, marks add nothing to the risk.</span>
        </label>
        <label className="block text-sm text-slate-700">Mark that counts fully (%)
          <input type="number" min={0} max={80} value={Number.isNaN(rules.risk.floor_mark) ? "" : rules.risk.floor_mark} onChange={(e) => set("risk", { floor_mark: numberValue(e.target.value) })} className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500">At or below this, marks add their full weight.</span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {([["marks", "Marks"], ["missing", "Missing or late work"], ["trend", "Falling marks"], ["integrity", "Exam flags"]] as const).map(([key, label]) => <label key={key} className="block text-sm text-slate-700">{label}
          <input type="number" min={0} max={100} value={Number.isNaN(rules.risk.weights[key]) ? "" : rules.risk.weights[key]} onChange={(e) => set("risk", { weights: { ...rules.risk.weights, [key]: numberValue(e.target.value) } })} className={inputClass} />
        </label>)}
      </div>
      <p className={`text-xs font-semibold ${weightTotal === 100 ? "text-emerald-700" : "text-rose-700"}`}>Weights add up to {weightTotal} {weightTotal === 100 ? "" : "(they must add up to 100)"}</p>
    </PanelCard>

    <div className="flex justify-end">
      <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save rules"}</button>
    </div>
  </div>;
}
