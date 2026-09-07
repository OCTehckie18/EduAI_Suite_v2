import { beforeEach, describe, expect, it } from "vitest";
import {
  getOrCreateChainAnswerPlayerSession,
  loadChainAnswerPlayerSession,
  saveChainAnswerPlayerSession,
} from "./chainAnswerPlayerSession";

describe("Chain Answer player sessions", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("creates and persists a trimmed player session", () => {
    const session = getOrCreateChainAnswerPlayerSession(42, "session-1", " Ada ");

    expect(session.gameId).toBe(42);
    expect(session.sessionId).toBe("session-1");
    expect(session.playerName).toBe("Ada");
    expect(loadChainAnswerPlayerSession()).toEqual(session);
  });

  it("keeps the player id when the name changes in the same session", () => {
    const original = saveChainAnswerPlayerSession(42, "session-1", "Ada");
    const updated = getOrCreateChainAnswerPlayerSession(42, "session-1", "Grace");

    expect(updated.playerId).toBe(original.playerId);
    expect(updated.playerName).toBe("Grace");
  });

  it("creates a new player id for a different session", () => {
    const original = getOrCreateChainAnswerPlayerSession(42, "session-1", "Ada");
    const next = getOrCreateChainAnswerPlayerSession(43, "session-2", "Ada");

    expect(next.playerId).not.toBe(original.playerId);
    expect(next.gameId).toBe(43);
  });
});
