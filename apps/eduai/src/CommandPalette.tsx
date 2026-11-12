import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { API_ENDPOINTS } from "./shared/apiConfig";
import { requestJson } from "./shared/request";
import { TabKey } from "./types";

export interface PaletteTab { tab: TabKey; label: string; subtitle: string }

/** Words that lead to a page or a setting, beyond the page's own name. */
const KEYWORDS: Partial<Record<TabKey, string>> = {
  overview: "dashboard home summary counts checklist warnings",
  university: "name address logo contact email domain sign-in domains details",
  look: "brand colour color theme font typeface corners density favicon dark mode portal name sign-in page background",
  modules: "switch off hide feature exams calendar games assignments mail turn on",
  rules: "exam violations tab switch fullscreen risk score password sign-in google student can edit lock reset attempts",
  notice: "banner announcement help desk support email phone hours link urgent",
  academic: "grading scale letter grades grade points cgpa pass mark percentage academic year term semester trimester time zone date format week start holidays",
  words: "terminology terms rename faculty school register number employee number student teacher class wording labels",
  fields: "id format roll number register number employee number custom field hostel blood group guardian extra profile pattern",
  documents: "letterhead logo footer signatory signature word report print header",
  campuses: "campus location",
  structure: "school department program class batch section hierarchy",
  roster: "admitted students upload download template csv excel register number",
  approvals: "teacher roster staff employee approve applicants pending",
  users: "accounts people edit role student teacher admin password",
  recycle_bin: "deleted restore deactivated trash",
};

interface Hit { id: string; title: string; subtitle: string; tab: TabKey | null; query: string; group: string }
interface Group { key: string; label: string; results: { id: string; title: string; subtitle: string; tab: TabKey | null; query: string }[] }

type Props = { tabs: PaletteTab[]; onGo: (tab: TabKey, query?: string) => void };

/** Ctrl+K (Cmd+K on a Mac): jump to any page or setting, or find a person, class, roster entry or recent action. */
export function CommandPalette({ tabs, onGo }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => { setOpen(false); setQuery(""); setGroups([]); setState("idle"); opener.current?.focus(); };

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Pages and settings are matched here, in the browser.
  const pages: Hit[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tabs
      .filter((tab) => !needle || `${tab.label} ${tab.subtitle} ${KEYWORDS[tab.tab] ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((tab) => ({ id: `page-${tab.tab}`, title: tab.label, subtitle: tab.subtitle, tab: tab.tab, query: "", group: "Pages and settings" }));
  }, [tabs, query]);

  // Records come from the server, a few per kind.
  useEffect(() => {
    const needle = query.trim();
    if (!open || needle.length < 2) { setGroups([]); setState("idle"); return; }
    setState("loading");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      requestJson<{ groups: Group[] }>(`${API_ENDPOINTS.MASTER_ADMIN}/search/?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        .then((data) => { setGroups(data.groups); setState("idle"); })
        .catch((err) => { if (err?.name !== "AbortError") { setGroups([]); setState("error"); } });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, open]);

  const hits: Hit[] = useMemo(
    () => [...pages, ...groups.flatMap((group) => group.results.map((result) => ({ ...result, group: group.label })))],
    [pages, groups],
  );
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { document.getElementById(`palette-hit-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (!open) return null;

  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    if (hit.tab) onGo(hit.tab, hit.query);
    close();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, hits.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(hits[active]); }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/50 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown} className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages, settings, people, classes..."
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={hits.length ? `palette-hit-${active}` : undefined}
            className="w-full bg-transparent py-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-500"
          />
          <kbd className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {hits.map((hit, index) => {
            const heading = hit.group !== lastGroup ? hit.group : "";
            lastGroup = hit.group;
            return (
              <li key={hit.id} role="presentation">
                {heading && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{heading}</p>}
                <button
                  id={`palette-hit-${index}`} role="option" aria-selected={index === active} type="button"
                  onMouseMove={() => setActive(index)} onClick={() => choose(hit)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${index === active ? "bg-slate-100" : ""}`}
                >
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{hit.title}</span><span className="block truncate text-xs text-slate-500">{hit.subtitle}</span></span>
                  {index === active && hit.tab && <CornerDownLeft className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
          {state === "loading" && <li className="px-3 py-3 text-sm text-slate-500">Searching...</li>}
          {state === "error" && <li className="px-3 py-3 text-sm text-rose-700">Could not search people and records. Pages and settings still work.</li>}
          {state === "idle" && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches for "{query.trim()}".</li>}
        </ul>
        <p className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">Up and down to move, Enter to open. Type two letters or more to find people, classes, roster entries and recent actions.</p>
      </div>
    </div>
  );
}
