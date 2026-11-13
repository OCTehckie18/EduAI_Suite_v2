import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme";

/** A switch for the header: sun for light mode, moon for dark mode. */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Dark mode on. Switch to light mode" : "Light mode on. Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        isDark ? "border-slate-600 bg-slate-700" : "border-slate-200 bg-slate-100"
      } ${className}`}
      style={{ ["--tw-ring-color" as string]: "var(--color-brand-accent)" }}
    >
      <span
        // The position is an inline style, not a class: this file lives outside each app, so a Tailwind class that
        // only appears here (left-7) is never generated and the knob would stay put.
        style={{ left: isDark ? 30 : 4 }}
        className={`absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full shadow transition-all ${
          isDark ? "bg-slate-900 text-amber-300" : "bg-white text-amber-500"
        }`}
      >
        {isDark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
};
