/** "Your university, your brand": pick three colours and watch a sample portal recolour itself. */
import { useMemo, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { Reveal } from "../effects";
import { brandPalette, type BrandColors } from "../shared/brand";
import { useTheme } from "../shared/theme";
import { ClassroomsMock, MiniSite } from "./Mockups";

type Colors = Required<BrandColors>;

export const PRESETS: { name: string; colors: Colors }[] = [
  { name: "Navy and gold", colors: { primary_color: "#264796", secondary_color: "#d0ae61", tertiary_color: "#0f766e" } },
  { name: "Maroon", colors: { primary_color: "#7a1f2b", secondary_color: "#d9a441", tertiary_color: "#2f6f4e" } },
  { name: "Forest", colors: { primary_color: "#1f5e3b", secondary_color: "#c9a227", tertiary_color: "#1e5a8a" } },
  { name: "Ocean", colors: { primary_color: "#0f5e75", secondary_color: "#f2a541", tertiary_color: "#b4432f" } },
  { name: "Charcoal and red", colors: { primary_color: "#2b2f36", secondary_color: "#c8102e", tertiary_color: "#0f766e" } },
];

const FIELDS: { key: keyof Colors; label: string; hint: string }[] = [
  { key: "primary_color", label: "Main colour", hint: "Buttons, links and sidebars" },
  { key: "secondary_color", label: "Second colour", hint: "Highlights and badges" },
  { key: "tertiary_color", label: "Accent colour", hint: "Status and focus rings" },
];

const same = (a: Colors, b: Colors) => FIELDS.every(({ key }) => a[key].toLowerCase() === b[key].toLowerCase());

export function BrandStudio() {
  const { isDark } = useTheme();
  const [colors, setColors] = useState<Colors>(PRESETS[1].colors);
  const [college, setCollege] = useState("Your College");
  const vars = useMemo(() => brandPalette(colors, isDark) as CSSProperties, [colors, isDark]);
  const name = college.trim() || "Your College";

  return (
    <section id="brand" aria-labelledby="brand-title" className="scroll-mt-20 border-y py-20 sm:py-28" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">Your university, your brand</p>
          <h2 id="brand-title" className="section-title mt-3">Four websites in your own colours</h2>
          <p className="mt-4 max-w-2xl text-lg" style={{ color: "var(--text-sub)" }}>
            Every college gets four websites of its own: a landing page, Master Admin, TeacherBuddy and EduGames. Your administrators set the name, logo and three colours once, and all four follow. Try it here.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal className="space-y-6">
            <div>
              <label htmlFor="college-name" className="text-sm font-semibold" style={{ color: "var(--text)" }}>College name</label>
              <input
                id="college-name"
                value={college}
                maxLength={40}
                onChange={(event) => setCollege(event.target.value)}
                className="field mt-2"
              />
            </div>

            <fieldset>
              <legend className="text-sm font-semibold" style={{ color: "var(--text)" }}>Start from a palette</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((preset) => {
                  const selected = same(preset.colors, colors);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setColors(preset.colors)}
                      className={`feature-tab inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${selected ? "is-active" : ""}`}
                    >
                      <span className="flex -space-x-1" aria-hidden="true">
                        {FIELDS.map(({ key }) => <span key={key} className="h-3.5 w-3.5 rounded-full border border-white/70" style={{ background: preset.colors[key] }} />)}
                      </span>
                      {preset.name}
                      {selected && <Check size={14} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold" style={{ color: "var(--text)" }}>Or pick your own</legend>
              {FIELDS.map(({ key, label, hint }) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(event) => setColors((current) => ({ ...current, [key]: event.target.value }))}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                    aria-label={label}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{label}</span>
                    <span className="block text-xs" style={{ color: "var(--text-dim)" }}>{hint}</span>
                  </span>
                  <span className="font-mono text-xs uppercase" style={{ color: "var(--text-sub)" }}>{colors[key]}</span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              In dark mode the portals lighten your colours just enough to keep text readable.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div data-testid="brand-preview" className="brand-preview space-y-4" style={vars}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniSite kind="landing" name={name} />
                <MiniSite kind="admin" name={name} />
                <MiniSite kind="teacherbuddy" name={name} />
                <MiniSite kind="edugames" name={name} />
              </div>
              <div aria-hidden="true">
                <ClassroomsMock />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
