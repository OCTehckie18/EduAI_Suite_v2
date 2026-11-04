import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChainAnswerSession,
  loadChainAnswerSession,
  saveChainAnswerSession,
} from "./chainAnswerPlayerSession";

describe("Chain Answer session memory", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("remembers the game the student is playing", () => {
    expect(loadChainAnswerSession()).toBeNull();
    saveChainAnswerSession("game_abc123");
    expect(loadChainAnswerSession()).toBe("game_abc123");
  });

  it("forgets it when told to, so leaving a game really leaves it", () => {
    saveChainAnswerSession("game_abc123");
    clearChainAnswerSession();
    expect(loadChainAnswerSession()).toBeNull();
  });

  it("never stores anything about who the player is", () => {
    saveChainAnswerSession("game_abc123");
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toMatch(/name|student|player/i);
  });
});
