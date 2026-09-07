import { useState, useCallback, useEffect } from "react";
import type {
  GameSession,
  GamePlayer,
  GameWord,
  ChainVariation,
  GameStatus,
  PlayerStatus,
} from "./types";

export interface ChainGameState {
  session: GameSession | null;
  players: GamePlayer[];
  chain: GameWord[];
  currentPlayerIndex: number;
  gameStatus: GameStatus;
  timer: number;
  errorMessage: string;
}

export interface ChainGameActions {
  initializeGame: (
    sessionId: string,
    config: {
      name: string;
      chainVariation: ChainVariation;
      category?: string;
      difficulty: "easy" | "medium" | "hard";
      language: string;
      startingWord: string;
    },
  ) => void;
  addPlayer: (studentId: string, name: string) => void;
  submitWord: (
    playerId: string,
    word: string,
    responseTime: number,
  ) => Promise<boolean>;
  skipTurn: (playerId: string) => void;
  startGame: () => void;
  endGame: () => void;
  clearError: () => void;
}

export const useChainGameState = (): [ChainGameState, ChainGameActions] => {
  const [state, setState] = useState<ChainGameState>({
    session: null,
    players: [],
    chain: [],
    currentPlayerIndex: 0,
    gameStatus: "setup",
    timer: 0,
    errorMessage: "",
  });

  const initializeGame = useCallback((sessionId: string, config: {
    name: string;
    chainVariation: ChainVariation;
    category?: string;
    difficulty: "easy" | "medium" | "hard";
    language: string;
    startingWord: string;
  }) => {
    setState((prev) => ({
      ...prev,
      session: {
        id: sessionId,
        teacherId: "",
        name: config.name,
        chainVariation: config.chainVariation,
        category: config.category,
        difficultyLevel: config.difficulty,
        language: config.language,
        status: "setup",
        startingWord: config.startingWord,
        createdAt: new Date(),
      },
      chain: [
        {
          id: "0",
          sessionId,
          word: config.startingWord,
          submittedBy: "system",
          submittedAt: new Date(),
          isValid: true,
          position: 0,
        },
      ],
    }));
  }, []);

  const addPlayer = useCallback((studentId: string, name: string) => {
    setState((prev) => {
      if (prev.session?.status !== "setup") {
        return prev;
      }
      const newPlayer: GamePlayer = {
        id: `player_${prev.players.length + 1}`,
        sessionId: prev.session!.id,
        studentId,
        name,
        joinOrder: prev.players.length,
        score: 0,
        wordsSubmitted: 0,
        wordsValid: 0,
        status: "active",
      };
      return {
        ...prev,
        players: [...prev.players, newPlayer],
      };
    });
  }, []);

  const submitWord = useCallback(
    async (
      playerId: string,
      word: string,
      responseTime: number,
    ): Promise<boolean> => {
      const playerIndex = state.players.findIndex((p) => p.id === playerId);
      if (playerIndex !== state.currentPlayerIndex) {
        setState((prev) => ({
          ...prev,
          errorMessage: "It is not your turn!",
        }));
        return false;
      }

      // Simulate validation - in production this would call backend
      const lastWord = state.chain[state.chain.length - 1].word.toLowerCase();
      const currentWord = word.toLowerCase();
      const lastLetter = lastWord[lastWord.length - 1];
      const firstLetter = currentWord[0];

      if (firstLetter !== lastLetter) {
        setState((prev) => ({
          ...prev,
          errorMessage: `Word must start with "${lastLetter}"`,
        }));
        return false;
      }

      // Word is valid - add to chain
      const newWord: GameWord = {
        id: `word_${state.chain.length}`,
        sessionId: state.session!.id,
        word: currentWord,
        submittedBy: playerId,
        submittedAt: new Date(),
        isValid: true,
        position: state.chain.length,
      };

      setState((prev) => {
        const nextPlayerIndex =
          (prev.currentPlayerIndex + 1) % prev.players.length;
        return {
          ...prev,
          chain: [...prev.chain, newWord],
          currentPlayerIndex: nextPlayerIndex,
          players: prev.players.map((p) => {
            if (p.id === playerId) {
              return {
                ...p,
                wordsSubmitted: p.wordsSubmitted + 1,
                wordsValid: p.wordsValid + 1,
                score: p.score + 10,
              };
            }
            return p;
          }),
          errorMessage: "",
          timer: 30, // Reset timer for next player
        };
      });

      return true;
    },
    [state.chain, state.currentPlayerIndex, state.players, state.session],
  );

  const skipTurn = useCallback((playerId: string) => {
    setState((prev) => {
      const nextPlayerIndex =
        (prev.currentPlayerIndex + 1) % prev.players.length;
      return {
        ...prev,
        currentPlayerIndex: nextPlayerIndex,
        players: prev.players.map((p) => {
          if (p.id === playerId) {
            return {
              ...p,
              status: "skipped" as PlayerStatus,
            };
          }
          return p;
        }),
        timer: 30,
      };
    });
  }, []);

  const startGame = useCallback(() => {
    setState((prev) => ({
      ...prev,
      gameStatus: "active",
      session: prev.session
        ? { ...prev.session, status: "active", startedAt: new Date() }
        : null,
      timer: 30,
    }));
  }, []);

  const endGame = useCallback(() => {
    setState((prev) => ({
      ...prev,
      gameStatus: "completed",
      session: prev.session
        ? { ...prev.session, status: "completed", endedAt: new Date() }
        : null,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      errorMessage: "",
    }));
  }, []);

  // Timer effect
  useEffect(() => {
    if (state.gameStatus !== "active" || state.timer <= 0) return;

    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        timer: Math.max(0, prev.timer - 1),
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.gameStatus, state.timer]);

  const actions: ChainGameActions = {
    initializeGame,
    addPlayer,
    submitWord,
    skipTurn,
    startGame,
    endGame,
    clearError,
  };

  return [state, actions];
};
