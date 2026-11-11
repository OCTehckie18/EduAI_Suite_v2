import { ChangeEvent, CSSProperties, useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { API_BASE_URL, authHeaders } from "./shared/apiConfig";
import type { Look, Portal, SignInPage } from "./shared/look";
import { requestJson } from "./shared/request";
import { University, setUniversity } from "./shared/university";
import { PanelCard, useConfirm, useToast } from "./ui";

const ENDPOINT = `${API_BASE_URL}/master-admin/university`;
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900";
const PORTALS: { key: Portal; label: string; defaultName: string; defaultHeadline: string }[] = [
  { key: "edugames", label: "Students", defaultName: "EduGames", defaultHeadline: "Play. Learn. Grow." },
  { key: "teacherbuddy", label: "Teachers", defaultName: "TeacherBuddy", defaultHeadline: "Empowering Educators." },
  { key: "master_admin", label: "Administration", defaultName: "Master Admin", defaultHeadline: "(no headline)" },
];
type Slot = "heading_font" | "body_font" | "favicon" | `signin_background:${Portal}`;

const googleFontUrl = (family: string) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;

/** Load a listed font for the preview only (the saved choice is applied to the whole portal after saving). */
function usePreviewFont(family: string | null) {
  useEffect(() => {
    if (!family) return;
    const id = `look-preview-${family.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = googleFontUrl(family);
    document.head.appendChild(link);
  }, [family]);
}

function fontLabel(look: Look, role: "heading_font" | "body_font") {
  const choice = look[role];
  const fallback = look.default_fonts?.[role] ?? (role === "heading_font" ? "Poppins" : "Inter");
  if (choice.kind === "curated") return choice.family;
  if (choice.kind === "upload") return `EduAI ${role === "heading_font" ? "heading" : "body"} ${choice.family}`;
  return fallback;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-sm text-slate-700">{label}{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}

export function LookPanel() {
  const confirm = useConfirm();
  const toast = useToast();
  const [look, setLook] = useState<Look | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busySlot, setBusySlot] = useState<Slot | null>(null);
  const [portal, setPortal] = useState<Portal>("edugames");
  const files = useRef<Partial<Record<Slot, HTMLInputElement | null>>>({});

  const apply = (data: University) => {
    if (data.look) setLook(structuredClone(data.look));
    setUniversity(data); // every part of this portal picks the new look up straight away
  };

  const load = async () => {
    setError("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the look settings.");
    }
  };
  useEffect(() => { void load(); }, []);

  usePreviewFont(look?.heading_font.kind === "curated" ? look.heading_font.family : null);
  usePreviewFont(look?.body_font.kind === "curated" ? look.body_font.family : null);

  if (!look) return error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></div> : <p className="text-slate-500">Loading the look settings...</p>;

  const page = look.signin[portal];
  const setPage = (patch: Partial<SignInPage>) => setLook({ ...look, signin: { ...look.signin, [portal]: { ...page, ...patch } } });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body = {
        heading_font: look.heading_font, body_font: look.body_font, corners: look.corners, density: look.density,
        portal_names: look.portal_names, signin: look.signin, links: look.links, landing: look.landing,
      };
      apply(await requestJson<University>(`${ENDPOINT}/look/`, { method: "PUT", body: JSON.stringify(body) }));
      toast.success("Look saved. Every portal now shows it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the look.");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (slot: Slot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusySlot(slot);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${ENDPOINT}/look/assets/${slot}/`, { method: "POST", headers: authHeaders(), body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "The upload failed.");
      apply(data);
      toast.success("Uploaded and saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setBusySlot(null);
    }
  };

  const remove = async (slot: Slot) => {
    setBusySlot(slot);
    setError("");
    try {
      apply(await requestJson<University>(`${ENDPOINT}/look/assets/${slot}/`, { method: "DELETE" }));
      toast.success("Removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove it.");
    } finally {
      setBusySlot(null);
    }
  };

  const reset = async () => {
    const ok = await confirm({ title: "Go back to the default look?", message: "Fonts, corners, density, portal names, sign-in pages, links and the landing text return to the defaults, and uploaded fonts, icons and backgrounds are deleted. Your name, logo and colours are kept.", confirmLabel: "Reset look", tone: "danger" });
    if (!ok) return;
    try {
      apply(await requestJson<University>(`${ENDPOINT}/look/reset/`, { method: "POST" }));
      toast.success("Back to the default look.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the look.");
    }
  };

  const fileInput = (slot: Slot, accept: string) => <input ref={(el) => { files.current[slot] = el; }} type="file" accept={accept} className="hidden" onChange={(e) => void upload(slot, e)} />;
  const uploadButton = (slot: Slot, label: string) => <button type="button" disabled={busySlot === slot} onClick={() => files.current[slot]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Upload className="h-3.5 w-3.5" />{busySlot === slot ? "Uploading..." : label}</button>;

  const fontPicker = (role: "heading_font" | "body_font", label: string) => {
    const choice = look[role];
    const fallback = look.default_fonts?.[role] ?? "";
    const value = choice.kind === "curated" ? `curated:${choice.family}` : choice.kind;
    return <div>
      <Field label={label}>
        <select value={value} onChange={(e) => {
          const next = e.target.value;
          setLook({ ...look, [role]: next === "default" ? { kind: "default", family: "" } : next === "upload" ? choice : { kind: "curated", family: next.slice(8) } });
        }} className={inputClass}>
          <option value="default">Default ({fallback})</option>
          {(look.curated_fonts ?? []).map((family) => <option key={family} value={`curated:${family}`}>{family}</option>)}
          {choice.kind === "upload" && <option value="upload">Uploaded: {choice.family}</option>}
        </select>
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {fileInput(role, ".woff2,.woff,.ttf,.otf")}
        {uploadButton(role, choice.kind === "upload" ? "Replace font file" : "Upload a font file")}
        {choice.kind === "upload" && <button type="button" onClick={() => void remove(role)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
      </div>
    </div>;
  };

  const previewStyle = { fontFamily: `"${fontLabel(look, "body_font")}", system-ui, sans-serif` } as CSSProperties;
  const headingStyle = { fontFamily: `"${fontLabel(look, "heading_font")}", system-ui, sans-serif` } as CSSProperties;
  const radius = { sharp: "4px", soft: "12px", round: "20px" }[look.corners];
  const portalDef = PORTALS.find((p) => p.key === portal)!;
  const bgUrl = page.background.kind === "image" && page.background.url ? `${API_BASE_URL}${page.background.url}` : null;
  const panelBackground = bgUrl
    ? `linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.55)), url("${bgUrl}") center / cover no-repeat`
    : page.background.kind === "colour" && page.background.colour ? page.background.colour
      : "linear-gradient(135deg, var(--color-brand-blue-dark) 0%, var(--color-brand-blue-fill) 100%)";

  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

    <PanelCard className="space-y-5">
      <div><h3 className="text-base font-semibold">Fonts, corners and density</h3>
        <p className="mt-1 text-xs text-slate-500">Used by every portal. Pick a font from the list, or upload your university's own font (WOFF2, WOFF, TTF or OTF, up to 2 MB). Only upload fonts your university is licensed to use on the web.</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        {fontPicker("heading_font", "Headings")}
        {fontPicker("body_font", "Body text")}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset><legend className="text-sm text-slate-700">Corners</legend>
          <div className="mt-1 flex gap-2">{(["sharp", "soft", "round"] as const).map((value) => <button key={value} type="button" onClick={() => setLook({ ...look, corners: value })} aria-pressed={look.corners === value} className={`flex-1 border px-3 py-2 text-xs font-semibold capitalize ${look.corners === value ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 text-slate-700"}`} style={{ borderRadius: { sharp: "3px", soft: "10px", round: "18px" }[value] }}>{value}{value === "soft" ? " (default)" : ""}</button>)}</div>
        </fieldset>
        <fieldset><legend className="text-sm text-slate-700">Density</legend>
          <div className="mt-1 flex gap-2">{(["comfortable", "compact"] as const).map((value) => <button key={value} type="button" onClick={() => setLook({ ...look, density: value })} aria-pressed={look.density === value} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize ${look.density === value ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 text-slate-700"}`}>{value}{value === "comfortable" ? " (default)" : ""}</button>)}</div>
          <span className="mt-1 block text-xs text-slate-500">Compact fits a little more on each screen.</span>
        </fieldset>
      </div>
      <figure className="border border-slate-200 bg-white p-4 text-slate-900" style={{ ...previewStyle, borderRadius: radius }} aria-label="Font preview">
        <p className="text-lg font-bold" style={headingStyle}>Data Structures: mid-term exam</p>
        <p className="mt-1 text-sm text-slate-600">12 of 13 graded. Results are released on Friday, and you can review your answer sheet any time after that.</p>
        <span className="mt-3 inline-block bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white" style={{ borderRadius: radius }}>Open class</span>
      </figure>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div><h3 className="text-base font-semibold">Portal names and tab icon</h3>
        <p className="mt-1 text-xs text-slate-500">Leave a name empty to keep the default. Names appear in the top bars, sign-in pages, the landing page and browser tabs.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PORTALS.map((p) => <Field key={p.key} label={`${p.label} portal`}>
          <input value={look.portal_names[p.key]} maxLength={30} placeholder={p.defaultName} onChange={(e) => setLook({ ...look, portal_names: { ...look.portal_names, [p.key]: e.target.value } })} className={inputClass} />
        </Field>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-white">
          {look.favicon_url ? <img src={`${API_BASE_URL}${look.favicon_url}`} alt="Tab icon" className="h-8 w-8 object-contain" /> : <ImagePlus className="h-4 w-4 text-slate-400" />}
        </span>
        <div className="text-xs text-slate-500">Browser tab icon. Without one, your logo is used.</div>
        {fileInput("favicon", "image/png,image/jpeg,image/webp")}
        {uploadButton("favicon", look.favicon_url ? "Replace icon" : "Upload icon")}
        {look.favicon_url && <button type="button" onClick={() => void remove("favicon")} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
      </div>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-base font-semibold">Sign-in pages</h3>
          <p className="mt-1 text-xs text-slate-500">Empty fields keep each portal's own wording.</p></div>
        <div className="flex gap-1 rounded-lg border border-slate-300 p-1" role="tablist">
          {PORTALS.map((p) => <button key={p.key} role="tab" aria-selected={portal === p.key} type="button" onClick={() => setPortal(p.key)} className={`rounded-md px-3 py-1 text-xs font-semibold ${portal === p.key ? "bg-brand-blue text-white" : "text-slate-700"}`}>{p.label}</button>)}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Field label="Headline"><input value={page.headline} maxLength={80} placeholder={portalDef.defaultHeadline} onChange={(e) => setPage({ headline: e.target.value })} className={inputClass} /></Field>
          <Field label="Line under the headline"><textarea value={page.text} maxLength={240} rows={2} onChange={(e) => setPage({ text: e.target.value })} className={inputClass} /></Field>
          <Field label="Motto or footer line" hint="Shown after the copyright line, for example your university's motto."><input value={page.motto} maxLength={80} onChange={(e) => setPage({ motto: e.target.value })} className={inputClass} /></Field>
          {portal !== "master_admin" && <div>
            <p className="text-sm text-slate-700">Highlights (up to 3; empty keeps the portal's own)</p>
            {[0, 1, 2].map((i) => {
              const item = page.highlights[i] ?? { title: "", text: "" };
              const setItem = (patch: Partial<typeof item>) => {
                const next = [0, 1, 2].map((k) => (k === i ? { ...item, ...patch } : page.highlights[k] ?? { title: "", text: "" }));
                setPage({ highlights: next.filter((h) => h.title.trim() || h.text.trim()) });
              };
              return <div key={i} className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
                <input value={item.title} maxLength={40} placeholder="Title" onChange={(e) => setItem({ title: e.target.value })} className={inputClass} aria-label={`Highlight ${i + 1} title`} />
                <input value={item.text} maxLength={100} placeholder="One line about it" onChange={(e) => setItem({ text: e.target.value })} className={inputClass} aria-label={`Highlight ${i + 1} text`} />
              </div>;
            })}
          </div>}
          <fieldset><legend className="text-sm text-slate-700">Background</legend>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {(["brand", "colour", "image"] as const).map((kind) => <button key={kind} type="button" aria-pressed={page.background.kind === kind} onClick={() => {
                if (kind === "image" && !page.background.url) { files.current[`signin_background:${portal}`]?.click(); return; }
                setPage({ background: { ...page.background, kind, colour: kind === "colour" ? page.background.colour || "#0b4a87" : page.background.colour } });
              }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${page.background.kind === kind ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 text-slate-700"}`}>{kind === "brand" ? (portal === "master_admin" ? "Plain (default)" : "Brand colours (default)") : kind === "colour" ? "A colour" : "An image"}</button>)}
              {page.background.kind === "colour" && <input type="color" value={page.background.colour || "#0b4a87"} onChange={(e) => setPage({ background: { kind: "colour", colour: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5" aria-label="Background colour" />}
              {fileInput(`signin_background:${portal}`, "image/png,image/jpeg,image/webp")}
              {page.background.kind === "image" && <>{uploadButton(`signin_background:${portal}`, "Replace image")}<button type="button" onClick={() => void remove(`signin_background:${portal}`)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline"><Trash2 className="h-3.5 w-3.5" />Remove</button></>}
            </div>
            <span className="mt-1 block text-xs text-slate-500">Images are shrunk to 2000 pixels and darkened slightly so the white text stays readable.</span>
          </fieldset>
        </div>
        <figure aria-label="Sign-in page preview" className="flex min-h-[260px] flex-col justify-between p-5 text-white" style={{ background: portal === "master_admin" && page.background.kind === "brand" ? "#f8fafc" : panelBackground, borderRadius: radius, ...previewStyle }}>
          <div className={portal === "master_admin" && page.background.kind === "brand" ? "text-slate-900" : ""}>
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">{look.portal_names[portal] || portalDef.defaultName}</p>
            <p className="mt-3 text-2xl font-black leading-tight" style={headingStyle}>{page.headline || portalDef.defaultHeadline}</p>
            {page.text && <p className="mt-2 text-sm opacity-80">{page.text}</p>}
            {page.highlights.length > 0 && <ul className="mt-3 space-y-1 text-xs">{page.highlights.map((h) => <li key={h.title}><strong>{h.title}</strong>{h.text ? `: ${h.text}` : ""}</li>)}</ul>}
          </div>
          <p className={`text-[11px] opacity-70 ${portal === "master_admin" && page.background.kind === "brand" ? "text-slate-600" : ""}`}>© {new Date().getFullYear()} Your university{page.motto ? ` · ${page.motto}` : ""}</p>
        </figure>
      </div>
    </PanelCard>

    <PanelCard className="space-y-4">
      <div><h3 className="text-base font-semibold">Links and landing page</h3>
        <p className="mt-1 text-xs text-slate-500">Links appear at the foot of every sign-in page. Use a full address (https://...) or mailto: for an email.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        {([["help", "Help desk"], ["privacy", "Privacy policy"], ["terms", "Terms of use"]] as const).map(([key, label]) => <Field key={key} label={label}>
          <input value={look.links[key]} placeholder="https://" onChange={(e) => setLook({ ...look, links: { ...look.links, [key]: e.target.value } })} className={inputClass} />
        </Field>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Landing page headline" hint="Empty shows your university name with 'digital campus'."><input value={look.landing.headline} maxLength={100} onChange={(e) => setLook({ ...look, landing: { ...look.landing, headline: e.target.value } })} className={inputClass} /></Field>
        <Field label="Landing page text"><textarea value={look.landing.text} maxLength={300} rows={2} onChange={(e) => setLook({ ...look, landing: { ...look.landing, text: e.target.value } })} className={inputClass} /></Field>
      </div>
    </PanelCard>

    <div className="flex flex-wrap justify-between gap-3">
      <button type="button" onClick={() => void reset()} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Reset to the default look</button>
      <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save look"}</button>
    </div>
  </div>;
}
