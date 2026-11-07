import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GlassCard } from "../../shared/components/GlassCard";
import { useAuthStore } from "../../store/useAuthStore";
import { getCurrentStudentId } from "../../shared/utils/currentStudent";
import { ChainGameBoard } from "./ChainGameBoard";
import { ChainAnswerGameJoinPage } from "./ChainAnswerGameJoinPage";
import {
  clearChainAnswerSession,
  loadChainAnswerSession,
  saveChainAnswerSession,
} from "./chainAnswerPlayerSession";

/**
 * Students play Chain Answer here. Teachers create and run games in TeacherBuddy, so this page never
 * offers game set-up: it only joins a game with its code (or the code in the link) and shows the board.
 */
export const ChainAnswerGamePage: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  // A link to a game wins over the game remembered from last time, so a new invite is never hidden behind an old one.
  const [activeSession, setActiveSession] = useState<string | null>(() => {
    const saved = loadChainAnswerSession();
    return urlSessionId && urlSessionId !== saved ? null : saved;
  });

  if (role !== "student") {
    return (
      <GlassCard className="mx-auto max-w-lg space-y-3 p-8 text-center">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>Chain Answer Game</h1>
        <p style={{ color: "var(--color-text-secondary)" }}>Games are created and run by teachers in TeacherBuddy. Sign in as a student to play.</p>
      </GlassCard>
    );
  }

  const leave = () => {
    clearChainAnswerSession();
    setActiveSession(null);
    navigate("/games/chain-answer", { replace: true });
  };

  if (activeSession) {
    return <ChainGameBoard sessionId={activeSession} myStudentId={getCurrentStudentId()} onExit={leave} onFatal={clearChainAnswerSession} />;
  }

  return (
    <ChainAnswerGameJoinPage
      initialSessionId={urlSessionId ?? ""}
      onJoined={(sessionId) => {
        saveChainAnswerSession(sessionId);
        setActiveSession(sessionId);
      }}
    />
  );
};
