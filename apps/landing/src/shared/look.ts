/** The university's look beyond colours (fonts, corners, density, tab icon), applied to the whole page.
 *
 * Shared, unchanged, by every portal. The values come from the public university endpoint; anything a
 * university has not changed is left to the portal's own stylesheet, so the default look is untouched. */

export type Portal = "teacherbuddy" | "edugames" | "master_admin";

export interface FontChoice { kind: "default" | "curated" | "upload"; family: string; url?: string; format?: string }
export interface SignInBackground { kind: "brand" | "colour" | "image"; colour: string; url?: string }
export interface SignInHighlight { title: string; text: string }
export interface SignInPage { headline: string; text: string; motto: string; highlights: SignInHighlight[]; background: SignInBackground }

export interface Look {
  heading_font: FontChoice;
  body_font: FontChoice;
  corners: "sharp" | "soft" | "round";
  density: "comfortable" | "compact";
  portal_names: Record<Portal, string>;
  favicon_url: string | null;
  signin: Record<Portal, SignInPage>;
  links: { help: string; privacy: string; terms: string };
  landing: { headline: string; text: string };
  curated_fonts?: string[];
  default_fonts?: { heading_font: string; body_font: string };
}

// Tailwind's corner sizes (rem). "Soft" is the portals' own look; the others scale every size.
const RADII: Record<string, number> = { xs: 0.125, sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, "2xl": 1, "3xl": 1.5, "4xl": 2 };
const CORNER_SCALE = { sharp: 0.35, soft: 1, round: 1.6 };
const FALLBACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const googleFontUrl = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap`;

function setElement(id: string, tag: "link" | "style", fill: (el: HTMLLinkElement | HTMLStyleElement) => void) {
  let el = document.getElementById(id) as HTMLLinkElement | HTMLStyleElement | null;
  if (el && el.tagName.toLowerCase() !== tag) { el.remove(); el = null; }
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    document.head.appendChild(el);
  }
  fill(el);
}

const removeElement = (id: string) => document.getElementById(id)?.remove();

/** The CSS font stack for a choice, or null to keep the portal's default font. */
export function fontStack(choice: FontChoice | undefined, role: "heading" | "body", apiBase: string): string | null {
  if (!choice || choice.kind === "default" || !choice.family) {
    removeElement(`eduai-font-${role}`);
    return null;
  }
  if (choice.kind === "curated") {
    setElement(`eduai-font-${role}`, "link", (el) => {
      const link = el as HTMLLinkElement;
      link.rel = "stylesheet";
      const href = googleFontUrl(choice.family);
      if (link.href !== href) link.href = href;
    });
    return `"${choice.family}", ${FALLBACK}`;
  }
  if (!choice.url) return null;
  const name = `EduAI ${role} ${choice.family}`;
  setElement(`eduai-font-${role}`, "style", (el) => {
    el.textContent = `@font-face { font-family: "${name}"; src: url("${apiBase}${choice.url}") format("${choice.format ?? "woff2"}"); font-display: swap; }`;
  });
  return `"${name}", ${FALLBACK}`;
}

function setFavicon(href: string | null) {
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

/** Apply the look to the page. ``fallbackIcon`` (the logo) is the tab icon when no icon was uploaded. */
export function applyLook(look: Look | undefined, apiBase: string, fallbackIcon?: string | null) {
  const root = document.documentElement;
  const heading = fontStack(look?.heading_font, "heading", apiBase);
  const body = fontStack(look?.body_font, "body", apiBase);
  if (heading) root.style.setProperty("--font-display", heading); else root.style.removeProperty("--font-display");
  if (body) root.style.setProperty("--font-sans", body); else root.style.removeProperty("--font-sans");

  const scale = CORNER_SCALE[look?.corners ?? "soft"] ?? 1;
  for (const [size, rem] of Object.entries(RADII)) {
    if (scale === 1) root.style.removeProperty(`--radius-${size}`);
    else root.style.setProperty(`--radius-${size}`, `${+(rem * scale).toFixed(3)}rem`);
  }
  root.style.setProperty("--eduai-radius-scale", String(scale));

  // Compact shrinks everything sized in rem (text, spacing, controls) a little.
  if (look?.density === "compact") root.style.fontSize = "15px"; else root.style.removeProperty("font-size");

  setFavicon(look?.favicon_url ? `${apiBase}${look.favicon_url}` : fallbackIcon ? `${apiBase}${fallbackIcon}` : null);
}
