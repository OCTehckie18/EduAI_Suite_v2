const STORAGE_KEY = "edugames-chain-answer-player-session";

export interface ChainAnswerPlayerSession {
  gameId: number;
  sessionId: string;
  playerId: string;
  playerName: string;
}

export const createChainAnswerPlayerId = () => {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);

  return `player_${Date.now()}_${randomPart}`;
};

export const loadChainAnswerPlayerSession =
  (): ChainAnswerPlayerSession | null => {
    const raw = sessionStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as ChainAnswerPlayerSession;
    } catch (error) {
      console.error(
        "Failed to parse stored Chain Answer player session:",
        error,
      );
      return null;
    }
  };

export const saveChainAnswerPlayerSession = (
  gameId: number,
  sessionId: string,
  playerName: string,
  playerId?: string,
) => {
  const session: ChainAnswerPlayerSession = {
    gameId,
    sessionId,
    playerId: playerId || createChainAnswerPlayerId(),
    playerName: playerName.trim(),
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
};

export const getOrCreateChainAnswerPlayerSession = (
  gameId: number,
  sessionId: string,
  playerName: string,
) => {
  const existing = loadChainAnswerPlayerSession();

  if (existing && existing.sessionId === sessionId) {
    return existing.playerName.trim() === playerName.trim()
      ? existing
      : saveChainAnswerPlayerSession(gameId, sessionId, playerName, existing.playerId);
  }

  return saveChainAnswerPlayerSession(gameId, sessionId, playerName);
};
