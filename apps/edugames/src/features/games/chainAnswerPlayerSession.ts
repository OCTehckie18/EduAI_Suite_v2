// Remembers which Chain Answer game this tab is playing, so a page refresh returns to it.
// Only the game's session id is kept: who the player is always comes from the login.
const STORAGE_KEY = "edugames-chain-answer-session";

export const loadChainAnswerSession = (): string | null => {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const saveChainAnswerSession = (sessionId: string): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  } catch {
    /* storage unavailable: the game still works, it just is not remembered */
  }
};

/** Forget the game, for example after leaving it or when the server says it is gone. */
export const clearChainAnswerSession = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
};
