import React, { useState, useEffect, useRef } from "react";
import {
  Wind, Music, Timer, Smile, ChevronRight, Play, Pause,
  Square, Volume2, VolumeX, Heart, Star, Zap, Coffee,
  RotateCcw, Check,
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

/* ─── Breathing Patterns ─────────────────────────────── */
const breathingPatterns = [
  { id: "box",         name: "Box Breathing",       desc: "4-4-4-4 pattern. Great for stress relief.",      in: 4, hold1: 4, out: 4, hold2: 4, color: "#264796" },
  { id: "478",         name: "4-7-8 Relaxation",    desc: "Promotes sleep and reduces anxiety.",            in: 4, hold1: 7, out: 8, hold2: 0, color: "#7c3aed" },
  { id: "coherent",   name: "Coherent Breathing",  desc: "5-5 rhythm. Balances the nervous system.",       in: 5, hold1: 0, out: 5, hold2: 0, color: "#059669" },
];

/* ─── Ambient Sounds ─────────────────────────────────── */
const sounds = [
  { id: "rain",   name: "Rain",        mark: "RN", desc: "Gentle rainfall"     },
  { id: "ocean",  name: "Ocean",       mark: "OC", desc: "Calming waves"        },
  { id: "forest", name: "Forest",      mark: "FR", desc: "Birds & rustling"     },
  { id: "white",  name: "White Noise", mark: "WN", desc: "Deep concentration"  },
  { id: "cafe",   name: "Café",        mark: "CF", desc: "Soft background hum"  },
  { id: "fire",   name: "Fireplace",   mark: "FP", desc: "Cozy & warm"         },
];

/* ─── Focus Timer ────────────────────────────────────── */
const focusPresets = [
  { label: "Pomodoro",  work: 25, rest: 5  },
  { label: "Deep Work", work: 50, rest: 10 },
  { label: "Short",     work: 15, rest: 5  },
];

/* ─── Mood Tracker ───────────────────────────────────── */
const moods = [
  { label: "Great",    mark: "G", color: "#16a34a" },
  { label: "Good",     mark: "G", color: "#264796" },
  { label: "Neutral",  mark: "N", color: "#d0ae61" },
  { label: "Tired",    mark: "T", color: "#7c3aed" },
  { label: "Stressed", mark: "S", color: "#dc2626" },
];

/* ─── Affirmations ───────────────────────────────────── */
const affirmations = [
  "You are making a meaningful impact on your students' lives.",
  "Taking care of yourself enables you to take care of others.",
  "Every class you teach shapes the future.",
  "Your dedication to education is truly admirable.",
  "Rest is not a reward — it is a requirement for excellence.",
];

export const WellbeingPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<"breathing" | "sounds" | "timer" | "mood">("breathing");
  const [selectedPattern, setSelectedPattern] = useState(breathingPatterns[0]);
  const [breathing, setBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "hold1" | "exhale" | "hold2">("inhale");
  const [breathSeconds, setBreathSeconds] = useState(0);
  const [breathCycles, setBreathCycles] = useState(0);

  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState(focusPresets[0]);
  const [timerMode, setTimerMode] = useState<"work" | "rest">("work");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(focusPresets[0].work * 60);
  const [sessionsComplete, setSessionsComplete] = useState(0);

  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [moodLogged, setMoodLogged] = useState(false);
  const [affirmationIdx, setAffirmationIdx] = useState(0);

  const breathRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Breathing Engine ───────────────────────────────── */
  useEffect(() => {
    if (!breathing) { if (breathRef.current) clearInterval(breathRef.current); return; }

    const phases: (keyof typeof selectedPattern)[] = ["in", "hold1", "out", "hold2"];
    const phaseNames: ("inhale" | "hold1" | "exhale" | "hold2")[] = ["inhale", "hold1", "exhale", "hold2"];
    let phaseIdx = 0;
    let sec = 0;

    const tick = () => {
      const phaseDur = selectedPattern[phases[phaseIdx] as "in" | "hold1" | "out" | "hold2"] as number;
      sec++;
      setBreathSeconds(sec);
      if (sec >= phaseDur) {
        sec = 0;
        phaseIdx = (phaseIdx + 1) % 4;
        // skip zero-duration phases
        while ((selectedPattern[phases[phaseIdx] as "in"|"hold1"|"out"|"hold2"] as number) === 0) {
          if (phaseIdx === 0) setBreathCycles(c => c + 1);
          phaseIdx = (phaseIdx + 1) % 4;
        }
        if (phaseIdx === 0) setBreathCycles(c => c + 1);
        setBreathPhase(phaseNames[phaseIdx]);
      }
    };

    setBreathPhase("inhale"); setBreathSeconds(0);
    breathRef.current = setInterval(tick, 1000);
    return () => { if (breathRef.current) clearInterval(breathRef.current); };
  }, [breathing, selectedPattern]);

  /* ─── Focus Timer Engine ─────────────────────────────── */
  useEffect(() => {
    if (!timerRunning) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimerSeconds(s => {
        if (s <= 1) {
          const next = timerMode === "work" ? "rest" : "work";
          setTimerMode(next);
          if (next === "work") setSessionsComplete(c => c + 1);
          clearInterval(timerRef.current!);
          setTimerRunning(false);
          return next === "work" ? selectedPreset.work * 60 : selectedPreset.rest * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerMode, selectedPreset]);

  const fmtTimer = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const breathMax = selectedPattern[breathPhase === "inhale" ? "in" : breathPhase === "hold1" ? "hold1" : breathPhase === "exhale" ? "out" : "hold2"] as number;
  const breathProgress = breathMax > 0 ? breathSeconds / breathMax : 0;
  const breathScale = breathPhase === "inhale" ? 1 + breathProgress * 0.35
    : breathPhase === "hold1" ? 1.35
    : breathPhase === "exhale" ? 1.35 - breathProgress * 0.35
    : 1;

  const timerTotal = timerMode === "work" ? selectedPreset.work * 60 : selectedPreset.rest * 60;
  const timerProgress = 1 - timerSeconds / timerTotal;

  const sections = [
    { id: "breathing", label: "Breathing",    icon: Wind,    color: "#264796" },
    { id: "sounds",   label: "Ambience",      icon: Music,   color: "#059669" },
    { id: "timer",    label: "Focus Timer",   icon: Timer,   color: "#d97706" },
    { id: "mood",     label: "Mood & Reflect",icon: Smile,   color: "#7c3aed" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
          Wellbeing Zone
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Your personal space for mental wellness, focus, and reflection.
        </p>
      </div>

      {/* Daily Affirmation */}
      <div className="gradient-blue rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute right-4 bottom-4 w-20 h-20 rounded-full bg-white/5" />
        <div className="flex items-start justify-between relative">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-2">
              <Star size={13} style={{ color: "var(--color-brand-gold)" }} />
              <span className="text-xs font-semibold tracking-wider uppercase opacity-70">Daily Affirmation</span>
            </div>
            <p className="text-base font-medium leading-relaxed opacity-90">
              "{affirmations[affirmationIdx]}"
            </p>
          </div>
          <button
            onClick={() => setAffirmationIdx(i => (i + 1) % affirmations.length)}
            className="shrink-0 p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <RotateCcw size={16} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id as typeof activeSection)}
            className={`glass-card p-4 flex flex-col items-center gap-2 transition-all card-interactive ${
              activeSection === s.id ? "shadow-lg" : ""
            }`}
            style={
              activeSection === s.id
                ? { boxShadow: `0 0 0 2px ${s.color}, 0 6px 20px ${s.color}25` }
                : {}
            }
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${s.color}18`, color: s.color }}>
              <s.icon size={20} />
            </div>
            <span className="text-xs font-semibold" style={{ color: activeSection === s.id ? s.color : "var(--color-text-secondary)" }}>
              {s.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Breathing Section ── */}
      {activeSection === "breathing" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="font-semibold text-sm" style={{ color: "var(--color-text-secondary)" }}>Choose a Pattern</p>
            {breathingPatterns.map(p => (
              <div
                key={p.id}
                onClick={() => { setSelectedPattern(p); setBreathing(false); setBreathCycles(0); }}
                className={`glass-card p-4 cursor-pointer transition-all hover:shadow-md border-l-4 ${
                  selectedPattern.id === p.id ? `border-l-[${p.color}] shadow-md` : "border-l-transparent"
                }`}
                style={selectedPattern.id === p.id ? { borderLeftColor: p.color, boxShadow: `0 4px 16px ${p.color}20` } : {}}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{p.desc}</p>
                    <div className="flex gap-2 mt-2 text-[10px] font-bold">
                      {([["In", p.in], ["H1", p.hold1], ["Out", p.out], ["H2", p.hold2]] as [string, number][]).filter(([, v]) => v > 0).map(([l, v]) => (
                        <span key={l} className="px-1.5 py-0.5 rounded" style={{ background: `${p.color}18`, color: p.color }}>
                          {l}: {v}s
                        </span>
                      ))}
                    </div>
                  </div>
                  {selectedPattern.id === p.id && <Check size={16} style={{ color: p.color }} />}
                </div>
              </div>
            ))}
          </div>

          {/* Breathing Visualizer */}
          <GlassCard className="flex flex-col items-center justify-center py-8">
            {/* Animated Ring */}
            <div className="relative flex items-center justify-center mb-6">
              {/* Outer ring */}
              <div
                className="absolute rounded-full border-4 transition-all duration-1000"
                style={{
                  width: 200, height: 200,
                  borderColor: `${selectedPattern.color}30`,
                  transform: `scale(${breathing ? breathScale : 1})`,
                }}
              />
              {/* Mid ring */}
              <div
                className="absolute rounded-full transition-all duration-1000"
                style={{
                  width: 160, height: 160,
                  background: `radial-gradient(circle, ${selectedPattern.color}25 0%, transparent 70%)`,
                  transform: `scale(${breathing ? breathScale * 0.95 : 1})`,
                }}
              />
              {/* Core */}
              <div
                className="relative rounded-full flex flex-col items-center justify-center text-white transition-all duration-1000"
                style={{
                  width: 120, height: 120,
                  background: `linear-gradient(135deg, ${selectedPattern.color}, ${selectedPattern.color}cc)`,
                  transform: `scale(${breathing ? breathScale * 0.9 : 1})`,
                  boxShadow: `0 8px 32px ${selectedPattern.color}60`,
                }}
              >
                {breathing ? (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                      {breathPhase === "inhale" ? "Inhale" : breathPhase === "hold1" ? "Hold" : breathPhase === "exhale" ? "Exhale" : "Hold"}
                    </p>
                    <p className="text-3xl font-black mt-0.5">{breathSeconds}</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold opacity-80">Press Start</p>
                )}
              </div>
            </div>

            {breathing && (
              <p className="text-xs mb-4 font-medium" style={{ color: "var(--color-text-muted)" }}>
                Cycle {breathCycles + 1}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setBreathing(b => !b)}
                className="btn text-white px-8 py-3"
                style={{ background: `linear-gradient(135deg, ${selectedPattern.color}, ${selectedPattern.color}cc)` }}
              >
                {breathing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Start</>}
              </button>
              <button
                onClick={() => { setBreathing(false); setBreathCycles(0); setBreathSeconds(0); setBreathPhase("inhale"); }}
                className="btn btn-ghost"
              >
                <Square size={15} />
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Sounds Section ── */}
      {activeSection === "sounds" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {activeSound ? `Now Playing: ${sounds.find(s => s.id === activeSound)?.name}` : "Select an ambient sound"}
            </p>
            {activeSound && (
              <button onClick={() => setMuted(m => !m)} className="btn btn-ghost text-sm gap-1.5">
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {sounds.map(s => (
              <div
                key={s.id}
                onClick={() => setActiveSound(p => p === s.id ? null : s.id)}
                className={`glass-card p-5 text-center cursor-pointer card-interactive transition-all ${
                  activeSound === s.id ? "ring-2 ring-[#059669] shadow-lg" : ""
                }`}
                style={activeSound === s.id ? { boxShadow: "0 8px 24px rgba(5,150,105,0.2)" } : {}}
              >
                <div className="text-2xl mb-3 font-semibold tracking-wide">{s.mark}</div>
                {activeSound === s.id && (
                  <div className="flex justify-center gap-1 mb-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-1 rounded-full bg-green-500"
                        style={{ height: `${12 + i * 6}px`, animation: `bounce-dot 1.2s ${i * 0.15}s ease-in-out infinite` }} />
                    ))}
                  </div>
                )}
                <p className="font-semibold text-sm" style={{ color: activeSound === s.id ? "#059669" : "var(--color-text-primary)" }}>
                  {s.name}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.15)", color: "var(--color-text-secondary)" }}>
             For best results, use headphones. Ambient sounds help mask distractions and improve focus.
          </div>
        </div>
      )}

      {/* ── Focus Timer Section ── */}
      {activeSection === "timer" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="font-semibold text-sm" style={{ color: "var(--color-text-secondary)" }}>Preset</p>
            <div className="space-y-2">
              {focusPresets.map(p => (
                <div
                  key={p.label}
                  onClick={() => { setSelectedPreset(p); setTimerRunning(false); setTimerMode("work"); setTimerSeconds(p.work * 60); }}
                  className={`glass-card p-4 cursor-pointer hover:shadow-md transition-all flex items-center justify-between border-l-4 ${
                    selectedPreset.label === p.label ? "border-l-[#d97706]" : "border-l-transparent"
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{p.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{p.work}m work · {p.rest}m rest</p>
                  </div>
                  {selectedPreset.label === p.label && <Check size={15} className="text-orange-500" />}
                </div>
              ))}
            </div>
            <GlassCard padding="sm" className="text-center">
              <p className="text-4xl mb-1"></p>
              <p className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>{sessionsComplete}</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Sessions completed today</p>
            </GlassCard>
          </div>

          <GlassCard className="flex flex-col items-center justify-center py-8 gap-5">
            {/* Timer Ring */}
            <div className="relative w-44 h-44">
              <svg className="absolute inset-0" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="80" fill="none" stroke="rgba(217,119,6,0.12)" strokeWidth="8" />
                <circle
                  cx="90" cy="90" r="80" fill="none"
                  stroke={timerMode === "work" ? "#d97706" : "#16a34a"}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 80}`}
                  strokeDashoffset={`${2 * Math.PI * 80 * (1 - timerProgress)}`}
                  transform="rotate(-90 90 90)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-widest mb-1"
                  style={{ color: timerMode === "work" ? "#d97706" : "#16a34a" }}>
                  {timerMode === "work" ? "Focus" : "Break"}
                </span>
                <span className="timer-display" style={{ color: "var(--color-text-primary)" }}>{fmtTimer(timerSeconds)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setTimerRunning(r => !r)}
                className="btn text-white px-8 py-3"
                style={{ background: timerMode === "work"
                  ? "linear-gradient(135deg,#d97706,#f59e0b)"
                  : "linear-gradient(135deg,#16a34a,#22c55e)" }}
              >
                {timerRunning ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Start</>}
              </button>
              <button
                onClick={() => { setTimerRunning(false); setTimerMode("work"); setTimerSeconds(selectedPreset.work * 60); }}
                className="btn btn-ghost"
              >
                <RotateCcw size={15} />
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <span className="flex items-center gap-1"><Zap size={11} className="text-orange-400" /> Work: {selectedPreset.work}m</span>
              <span className="flex items-center gap-1"><Coffee size={11} className="text-green-500" /> Rest: {selectedPreset.rest}m</span>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Mood Section ── */}
      {activeSection === "mood" && (
        <div className="grid md:grid-cols-2 gap-6">
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <Heart size={16} style={{ color: "var(--color-brand-blue)" }} />
              <h3 className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>How are you feeling today?</h3>
            </div>
            <div className="flex gap-3 flex-wrap mb-5">
              {moods.map(m => (
                <button
                  key={m.label}
                  onClick={() => { setSelectedMood(m.label); setMoodLogged(false); }}
                  className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                    selectedMood === m.label ? "shadow-md" : "border-slate-200 hover:border-slate-300"
                  }`}
                  style={selectedMood === m.label ? { borderColor: m.color, boxShadow: `0 4px 16px ${m.color}25` } : {}}
                >
                  <span className="text-xl font-semibold">{m.mark}</span>
                  <span className="text-[11px] font-semibold" style={{ color: selectedMood === m.label ? m.color : "var(--color-text-muted)" }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              className="form-input text-sm resize-none mb-3"
              rows={3}
              placeholder="Optional: Share what's on your mind today…"
            />

            <button
              className="btn btn-primary w-full"
              disabled={!selectedMood}
              onClick={() => setMoodLogged(true)}
            >
              <Heart size={14} /> Log My Mood
            </button>

            {moodLogged && (
              <div className="mt-3 p-3 rounded-xl flex items-center gap-2 animate-fade-in"
                style={{ background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.2)" }}>
                <Check size={14} className="text-green-600" />
                <p className="text-sm text-green-700 font-semibold">Mood logged. Keep taking care of yourself.</p>
              </div>
            )}
          </GlassCard>

          {/* Mood History */}
          <div className="space-y-4">
            <GlassCard padding="sm">
              <p className="font-bold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>This Week's Mood</p>
              <div className="flex items-end gap-2">
                {[
                  { day: "Mon", mark: "G", color: "#16a34a" },
                  { day: "Tue", mark: "G", color: "#264796" },
                  { day: "Wed", mark: "S", color: "#dc2626" },
                  { day: "Thu", mark: "N", color: "#d0ae61" },
                  { day: "Fri", mark: "G", color: "#264796" },
                  { day: "Sat", mark: "G", color: "#16a34a" },
                  { day: "Sun", mark: "T", color: "#7c3aed" },
                ].map(d => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xl font-semibold">{d.mark}</span>
                    <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{d.day}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard padding="sm">
              <p className="font-bold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Quick Tips for Today</p>
              <ul className="space-y-2.5">
                {[
                  "Take a 5-min walk between classes to reset.",
                  "Drink 8 glasses of water — dehydration causes fatigue.",
                  "Practice 3 deep breaths before difficult conversations.",
                  "Acknowledge one thing you did well today.",
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-white"
                      style={{ background: "var(--color-brand-blue)" }}>{i + 1}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
};
