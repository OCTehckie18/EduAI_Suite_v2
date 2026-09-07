import React from "react";
import { HardHat, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "./GlassCard";

export const ConstructionPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 animate-fade-in">
      <GlassCard className="max-w-md w-full p-10 text-center flex flex-col items-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
          style={{ background: "linear-gradient(135deg, rgba(38,71,150,0.2) 0%, rgba(38,71,150,0.05) 100%)", border: "1px solid rgba(38,71,150,0.3)" }}>
          <HardHat size={40} style={{ color: "var(--color-brand-blue)" }} />
        </div>
        
        <h1 className="text-2xl font-bold mb-2 font-display" style={{ color: "var(--color-text-primary)" }}>
          Module Under Construction
        </h1>
        
        <p className="text-sm mb-8 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          We are actively working on bringing this feature to you. 
          The development team is laying bricks and connecting circuits. 
          Please check back soon!
        </p>
        
        <button 
          onClick={() => navigate(-1)} 
          className="btn btn-primary flex items-center gap-2"
        >
          <ArrowLeft size={16} /> Go Back
        </button>
      </GlassCard>
    </div>
  );
};
