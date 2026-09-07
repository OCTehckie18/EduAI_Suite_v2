import React from "react";
import { FileSignature, Sparkles, Wand2 } from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";
import { useTheme } from "../../shared/hooks/useTheme";

export const FormsPage: React.FC = () => {
  const { isDark } = useTheme();

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold font-display" style={{ color: "var(--color-text-primary)" }}>Form Automation</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          Reduce administrative burden. The AI Form Filler extracts data from your classrooms, attendance, and evaluation records to instantly populate standard academic forms.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <GlassCard className="p-6 md:col-span-2 lg:col-span-3 flex flex-col items-center justify-center gap-3 min-h-48 text-center">
          <FileSignature size={32} style={{ color: "var(--color-text-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>No form templates are available.</p>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Upload a template to make it available for AI-assisted completion.</p>
        </GlassCard>

        {/* Custom Form Block */}
        <div className="p-1 rounded-3xl" style={{ background: "linear-gradient(135deg,rgba(208,174,97,0.4),rgba(38,71,150,0.4))" }}>
          <div className="w-full h-full p-6 rounded-[22px] flex flex-col items-center justify-center text-center space-y-4" style={{ background: "var(--color-surface-base)" }}>
             <Wand2 size={40} style={{ color: "var(--color-brand-gold)" }} />
             <div>
               <h3 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>Upload Custom Form</h3>
               <p className="text-sm px-4 mt-1" style={{ color: "var(--color-text-secondary)" }}>Upload a blank PDF and let the AI figure out what to fill based on your context.</p>
             </div>
             <button className="btn btn-primary px-8 shadow-[0_4px_15px_rgba(208,174,97,0.3)]">Upload PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
};
