import { useEffect, useState } from "react";
import { applyBrand } from "./brand";
import { applyLook } from "./look";
import type { Look, Portal, SignInPage } from "./look";
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
  /** Optional colours for dark mode; empty means they are worked out from the light ones. */
  primary_color_dark?: string;
  secondary_color_dark?: string;
  tertiary_color_dark?: string;
  /** Fonts, corners, portal names, sign-in pages ... (missing on an old cached copy). */
  look?: Look;
}

const EMPTY: University = {
  configured: false, name: "", short_name: "", email_domain: "", contact_email: "",
  phone: "", website: "", address: "", logo_url: null, logo_dark_url: null,
  primary_color: "#0b4a87", secondary_color: "#e8792b", tertiary_color: "#0f766e",
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
applyLook(current.look, API_BASE_URL, current.logo_url);
let inflight: Promise<void> | null = null;
const listeners = new Set<(value: University) => void>();

const publish = (next: University) => {
  current = next;
  applyBrand(next);
  applyLook(next.look, API_BASE_URL, next.logo_url);
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

/** The portal's name as the university calls it (for example "Student Hub" instead of "EduGames"). */
export const portalName = (university: University, portal: Portal, fallback: string) =>
  university.look?.portal_names?.[portal]?.trim() || fallback;

const NO_PAGE: SignInPage = { headline: "", text: "", motto: "", highlights: [], background: { kind: "brand", colour: "" } };

/** What the university chose for a portal's sign-in page (empty values mean "use the portal's own text"). */
export const signInPage = (university: University, portal: Portal): SignInPage => university.look?.signin?.[portal] ?? NO_PAGE;

/** The help, privacy and terms links shown at the foot of the sign-in pages. */
export const siteLinks = (university: University): [string, string][] => {
  const links = university.look?.links;
  const all: [string, string | undefined][] = [["Help", links?.help], ["Privacy", links?.privacy], ["Terms of use", links?.terms]];
  return all.filter((entry): entry is [string, string] => Boolean(entry[1]));
};

/** CSS background for a sign-in panel: the university's image or colour, else a gradient of its brand colours. */
export const signInBackground = (page: SignInPage): string => {
  if (page.background.kind === "image" && page.background.url) {
    return `linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.55)), url("${API_BASE_URL}${page.background.url}") center / cover no-repeat`;
  }
  if (page.background.kind === "colour" && page.background.colour) return page.background.colour;
  return "linear-gradient(135deg, var(--color-brand-blue-dark) 0%, var(--color-brand-blue-fill) 100%)";
};

export function useDocumentTitle(app: string, portal?: Portal) {
  const university = useUniversity();
  const label = university.short_name || university.name;
  const name = portal ? portalName(university, portal, app) : app;
  useEffect(() => {
    document.title = label ? `${label} · ${name}` : name;
  }, [label, name]);
}

/** The portal's name, as the university calls it, kept up to date when it changes. */
export function PortalName({ portal, fallback }: { portal: Portal; fallback: string }) {
  const university = useUniversity();
  return <>{portalName(university, portal, fallback)}</>;
}

export function BrandingTitle({ app, portal }: { app: string; portal?: Portal }) {
  useDocumentTitle(app, portal);
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
