/** Light or dark mode for the whole portal. The choice is remembered on this device. */
import { useEffect, useState } from "react";
import { reapplyBrand } from "./brand";

export type Theme = "light" | "dark";
const KEY = "eduai-suite-theme";
const EVENT = "eduai-suite-theme-change";

const stored = (): Theme | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
};

/** The saved choice, or the device's own setting the first time. */
export const currentTheme = (): Theme =>
  stored() ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

let settle: number | undefined;

export const applyTheme = (theme: Theme, animate = false) => {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-switching");
    window.clearTimeout(settle);
    settle = window.setTimeout(() => root.classList.remove("theme-switching"), 250);
  }
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme; // native inputs, scrollbars and pickers follow
  reapplyBrand(); // the brand colours have lighter versions for dark backgrounds
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
};

export const setTheme = (theme: Theme) => {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice still applies until the page reloads */
  }
  applyTheme(theme, true);
};

/** Call once before the first render so the page never flashes the wrong colours. */
export const initTheme = () => applyTheme(currentTheme());

export const useTheme = () => {
  const [theme, setState] = useState<Theme>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  useEffect(() => {
    const onChange = (e: Event) => setState((e as CustomEvent<Theme>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return { theme, isDark: theme === "dark", toggle: () => setTheme(theme === "dark" ? "light" : "dark"), setTheme };
};
