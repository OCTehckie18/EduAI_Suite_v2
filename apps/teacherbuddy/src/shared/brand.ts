/** Turns the university's three brand colours into the CSS variables every portal's styles use. */
const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
/** Mix `hex` with `other` (0 keeps `hex`, 1 gives `other`). */
const mix = (hex: string, other: string, amount: number) => {
  const a = channels(hex), b = channels(other);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};
const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount);
const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);

export interface BrandColors { primary_color?: string; secondary_color?: string; tertiary_color?: string }

export function applyBrand(colors: BrandColors) {
  const style = document.documentElement.style;
  const set = (name: string, value: string) => style.setProperty(name, value);
  const { primary_color: p, secondary_color: s, tertiary_color: t } = colors;
  if (p && HEX.test(p)) {
    set("--color-brand-blue", p);
    set("--color-brand-blue-mid", lighten(p, 0.06));
    set("--color-brand-blue-light", lighten(p, 0.16));
    set("--color-brand-blue-dark", darken(p, 0.28));
    set("--color-brand-blue-pale", lighten(p, 0.92));
  }
  if (s && HEX.test(s)) {
    set("--color-brand-gold", s);
    set("--color-brand-gold-light", lighten(s, 0.12));
    set("--color-brand-gold-bright", lighten(s, 0.28));
    set("--color-brand-gold-dark", darken(s, 0.2));
    set("--color-brand-gold-pale", lighten(s, 0.9));
  }
  if (t && HEX.test(t)) {
    set("--color-brand-accent", t);
    set("--color-brand-accent-light", lighten(t, 0.16));
    set("--color-brand-accent-dark", darken(t, 0.25));
    set("--color-brand-accent-pale", lighten(t, 0.9));
  }
}
