import { useEffect, useState } from "react";
import { API_BASE_URL } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { University, setUniversity } from "./shared/university";
import { PanelCard, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university/notice/`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";

interface NoticeForm { enabled: boolean; text: string; tone: "info" | "urgent"; dismissable: boolean; starts_at: string; ends_at: string }
interface HelpForm { email: string; phone: string; hours: string; link: string }
interface Response { notice: { enabled: boolean; text: string; tone: "info" | "urgent"; dismissable: boolean; starts_at: string | null; ends_at: string | null }; help: HelpForm; showing_now: boolean }

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The institution-wide notice banner and the help-desk details shown in every portal. */
export function NoticePanel() {
  const toast = useToast();
  const [notice, setNotice] = useState<NoticeForm | null>(null);
  const [help, setHelp] = useState<HelpForm | null>(null);
  const [showing, setShowing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const show = (data: Response) => {
    setNotice({ ...data.notice, starts_at: toLocal(data.notice.starts_at), ends_at: toLocal(data.notice.ends_at) });
    setHelp(data.help);
    setShowing(data.showing_now);
  };

  const load = async () => {
    setError("");
    try {
      show(await requestJson<Response>(ENDPOINT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the notice settings.");
    }
  };
  useEffect(() => { void load(); }, []);

  if (!notice || !help) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading...</p>;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = {
        notice: { ...notice, starts_at: notice.starts_at ? new Date(notice.starts_at).toISOString() : null, ends_at: notice.ends_at ? new Date(notice.ends_at).toISOString() : null },
        help,
      };
      const data = await requestJson<Response & { university: University }>(ENDPOINT, { method: "PUT", body: JSON.stringify(body) });
      show(data);
      setUniversity(data.university);
      toast.success("Saved. Every portal shows it now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const urgent = notice.tone === "urgent";

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

    <PanelCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">Notice banner</h3>
          <p className="mt-1 text-xs text-slate-500">A message across the top of every portal, for exam dates, maintenance or holidays. {showing ? <strong className="text-emerald-700">It is showing now.</strong> : "It is not showing right now."}</p></div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={notice.enabled} onChange={(e) => setNotice({ ...notice, enabled: e.target.checked })} /> Show the notice
        </label>
      </div>
      <label className="block text-sm text-slate-700">Message
        <textarea rows={2} maxLength={300} value={notice.text} onChange={(e) => setNotice({ ...notice, text: e.target.value })} className={inputClass} placeholder="For example: Semester exams start on 2 December. Check your exam schedule." />
        <span className="mt-1 block text-right text-xs text-slate-500">{notice.text.length} / 300</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="text-sm text-slate-700">Style
          <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Notice style">
            {([["info", "Information"], ["urgent", "Urgent"]] as const).map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={notice.tone === key} onClick={() => setNotice({ ...notice, tone: key })}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${notice.tone === key ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 text-slate-700"}`}>{label}</button>)}
          </div>
        </div>
        <label className="flex items-center gap-2 self-end text-sm text-slate-700">
          <input type="checkbox" checked={notice.dismissable} onChange={(e) => setNotice({ ...notice, dismissable: e.target.checked })} /> People can dismiss it
        </label>
        <label className="block text-sm text-slate-700">Starts (optional)
          <input type="datetime-local" value={notice.starts_at} onChange={(e) => setNotice({ ...notice, starts_at: e.target.value })} className={inputClass} />
        </label>
        <label className="block text-sm text-slate-700">Ends (optional)
          <input type="datetime-local" value={notice.ends_at} onChange={(e) => setNotice({ ...notice, ends_at: e.target.value })} className={inputClass} />
          <span className="mt-1 block text-xs text-slate-500">It switches itself off at this time.</span>
        </label>
      </div>
      <figure aria-label="Notice preview" className="overflow-hidden rounded-lg">
        <div className="flex items-start gap-3 px-4 py-2.5 text-sm text-white" style={{ background: urgent ? "#b91c1c" : "var(--color-brand-blue-fill)" }}>
          <p className="min-w-0 flex-1 font-medium">{notice.text || "Your message appears here."}</p>
          {notice.dismissable && <span aria-hidden="true" className="text-lg leading-none">&times;</span>}
        </div>
      </figure>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div><h3 className="text-base font-semibold">Help desk</h3>
        <p className="mt-1 text-xs text-slate-500">Shown in the account menu of TeacherBuddy and EduGames, under "Need help?". Leave everything empty to show nothing.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">Email<input value={help.email} onChange={(e) => setHelp({ ...help, email: e.target.value })} className={inputClass} placeholder="help@example.edu" /></label>
        <label className="block text-sm text-slate-700">Phone<input value={help.phone} maxLength={30} onChange={(e) => setHelp({ ...help, phone: e.target.value })} className={inputClass} placeholder="+91 80 1234 5678" /></label>
        <label className="block text-sm text-slate-700">Hours<input value={help.hours} maxLength={100} onChange={(e) => setHelp({ ...help, hours: e.target.value })} className={inputClass} placeholder="Monday to Friday, 9 am to 5 pm" /></label>
        <label className="block text-sm text-slate-700">"How to" link<input value={help.link} onChange={(e) => setHelp({ ...help, link: e.target.value })} className={inputClass} placeholder="https://help.example.edu/eduai" /></label>
      </div>
    </PanelCard>

    <div className="flex justify-end">
      <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
    </div>
  </div>;
}
