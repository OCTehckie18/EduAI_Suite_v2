import { useEffect, useState } from "react";
import { API_BASE_URL } from "./apiConfig";

/** The university this installation belongs to, as set by the master admin. */
export interface University {
  configured: boolean;
  name: string;
  short_name: string;
  email_domain: string;
  contact_email: string;
  phone: string;
  website: string;
  address: string;
  logo_url: string | null;
}

const EMPTY: University = {
  configured: false, name: "", short_name: "", email_domain: "", contact_email: "",
  phone: "", website: "", address: "", logo_url: null,
};
const CACHE_KEY = "eduai-university";

const readCache = (): University => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
};

let current: University = readCache();
let inflight: Promise<void> | null = null;
const listeners = new Set<(value: University) => void>();

const publish = (next: University) => {
  current = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((listener) => listener(next));
};

/** Fetch the latest details (public endpoint, works before sign-in) and notify every component. */
export function refreshUniversity(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch(`${API_BASE_URL}/institution/university/`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => { if (data) publish({ ...EMPTY, ...data }); })
    .catch(() => { /* keep showing the cached details */ })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Push details we already have (for example right after the master admin saves them). */
export const setUniversity = (value: University) => publish({ ...EMPTY, ...value });

export function useUniversity(): University {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    void refreshUniversity();
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

export const logoSrc = (university: University): string | null =>
  university.logo_url ? `${API_BASE_URL}${university.logo_url}` : null;

export function useDocumentTitle(app: string) {
  const university = useUniversity();
  const label = university.short_name || university.name;
  useEffect(() => {
    document.title = label ? `${label} · ${app}` : app;
  }, [label, app]);
}

export function BrandingTitle({ app }: { app: string }) {
  useDocumentTitle(app);
  return null;
}

/** University logo (and short name) shown at the top bar, just left of the signed-in account. */
export function UniversityBadge({ className = "", labelClassName = "" }: { className?: string; labelClassName?: string }) {
  const university = useUniversity();
  const src = logoSrc(university);
  const label = university.short_name || university.name;
  if (!src && !label) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`} title={university.name}>
      {src && <img src={src} alt={university.name ? `${university.name} logo` : "University logo"} className="h-8 max-w-[120px] object-contain" />}
      {label && <span className={`hidden max-w-[140px] truncate text-xs font-semibold lg:block ${labelClassName}`}>{label}</span>}
    </div>
  );
}
