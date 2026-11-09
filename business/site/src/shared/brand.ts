/** Turns three brand colours into the --color-brand-* CSS variables the site and the mock portals use.
 *
 * In dark mode the same colours are lightened just enough to stay readable on dark surfaces
 * (and keep white button text readable), and the pale tints become dark tints. */
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULTS = { primary_color: "#264796", secondary_color: "#d0ae61", tertiary_color: "#0f766e" };
const DARK_CARD = "#131c2e";

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
/** Mix `hex` with `other` (0 keeps `hex`, 1 gives `other`). */
const mix = (hex: string, other: string, amount: number) => {
  const a = channels(hex), b = channels(other);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};
const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount);
const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The lightest step of `hex` that still keeps white text readable on it, while being as readable as possible on dark cards. */
const forDark = (hex: string) => {
  let best = hex;
  for (let step = 0; step <= 0.6; step += 0.02) {
    const candidate = lighten(hex, step);
    if (contrast("#ffffff", candidate) < 4.5) break;
    best = candidate;
  }
  return best;
};

/** The first step of `hex` that reads as text (WCAG AA, 4.5:1) on dark cards, including cards
 * tinted with the brand colour itself (badges, selected rows). */
const TINTED_CARD = "#1f2a44";
const textOnDark = (hex: string) => {
  for (let step = 0; step <= 1; step += 0.02) {
    const candidate = lighten(hex, step);
    if (contrast(candidate, TINTED_CARD) >= 4.6) return candidate;
  }
  return "#ffffff";
};

export interface BrandColors { primary_color?: string; secondary_color?: string; tertiary_color?: string }

let last: BrandColors = {};

/** Every brand variable for one mode, worked out from the three colours. */
export function brandPalette(colors: BrandColors, dark: boolean): Record<string, string> {
  const pick = (value: string | undefined, fallback: string) => (value && HEX.test(value) ? value : fallback);
  const p0 = pick(colors.primary_color, DEFAULTS.primary_color);
  const s0 = pick(colors.secondary_color, DEFAULTS.secondary_color);
  const t0 = pick(colors.tertiary_color, DEFAULTS.tertiary_color);
  // In dark mode one colour cannot be both readable text on a dark card and a button fill
  // under white text, so the fill gets its own variable.
  const p = dark ? textOnDark(p0) : p0;
  const t = dark ? textOnDark(t0) : t0;
  const s = s0;
  const fill = dark ? forDark(p0) : p0;
  return {
    "--color-brand-blue": p,
    "--color-brand-blue-fill": fill,
    "--color-brand-blue-fill-2": dark ? darken(fill, 0.14) : lighten(p0, 0.16), // second gradient stop
    "--color-brand-accent-fill": dark ? forDark(t0) : t0,
    "--color-brand-blue-mid": lighten(p, 0.06),
    "--color-brand-blue-light": lighten(p, 0.16),
    "--color-brand-blue-dark": darken(p0, 0.28), // sidebars and gradients stay deep in both modes
    "--color-brand-blue-pale": dark ? mix(p0, DARK_CARD, 0.78) : lighten(p0, 0.92),
    "--color-brand-gold": s,
    "--color-brand-gold-light": lighten(s, 0.12),
    "--color-brand-gold-bright": lighten(s, 0.28),
    "--color-brand-gold-dark": dark ? lighten(s, 0.1) : darken(s, 0.2),
    "--color-brand-gold-pale": dark ? mix(s0, DARK_CARD, 0.82) : lighten(s, 0.9),
    "--color-brand-accent": t,
    "--color-brand-accent-light": lighten(t, 0.16),
    "--color-brand-accent-dark": darken(t0, 0.25),
    "--color-brand-accent-pale": dark ? mix(t0, DARK_CARD, 0.8) : lighten(t0, 0.9),
  };
}

/** WCAG contrast ratio between two #rrggbb colours (for previews). */
export const contrastRatio = (a: string, b: string) => (HEX.test(a) && HEX.test(b) ? contrast(a, b) : 0);

export function applyBrand(colors: BrandColors) {
  last = { ...last, ...colors };
  const dark = document.documentElement.classList.contains("dark");
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(brandPalette(last, dark))) style.setProperty(name, value);
}

/** Re-run with the last colours, after switching between light and dark. */
export const reapplyBrand = () => applyBrand({});
