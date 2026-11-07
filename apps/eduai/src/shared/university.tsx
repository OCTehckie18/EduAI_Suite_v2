import { useEffect, useState } from "react";
import { applyBrand } from "./brand";
import { useTheme } from "./theme";
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
  /** Optional version for dark mode; without it the light logo is shown on a white tile. */
  logo_dark_url: string | null;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
}

const EMPTY: University = {
  configured: false, name: "", short_name: "", email_domain: "", contact_email: "",
  phone: "", website: "", address: "", logo_url: null, logo_dark_url: null,
  primary_color: "#264796", secondary_color: "#d0ae61", tertiary_color: "#0f766e",
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
applyBrand(current); // paint the saved colours before the first render, so there is no flash of the default theme
let inflight: Promise<void> | null = null;
const listeners = new Set<(value: University) => void>();

const publish = (next: University) => {
  current = next;
  applyBrand(next);
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
  useTheme(); // re-render on a light/dark switch, so the right logo is shown
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    void refreshUniversity();
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}

const isDark = () => document.documentElement.classList.contains("dark");

/** Which logo suits the current mode: the dark-mode logo when there is one and dark mode is on. */
export const logoVariant = (university: University): "light" | "dark" =>
  isDark() && university.logo_dark_url ? "dark" : "light";

export const logoSrc = (university: University): string | null => {
  const path = logoVariant(university) === "dark" ? university.logo_dark_url : university.logo_url;
  return path ? `${API_BASE_URL}${path}` : null;
};

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
      {src && <img src={src} data-variant={logoVariant(university)} alt={university.name ? `${university.name} logo` : "University logo"} className="logo-chip h-8 max-w-[120px] object-contain" />}
      {label && <span className={`hidden max-w-[140px] truncate text-xs font-semibold lg:block ${labelClassName}`}>{label}</span>}
    </div>
  );
}
