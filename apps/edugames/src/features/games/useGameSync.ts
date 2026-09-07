import { useEffect, useRef, useState, useCallback } from "react";
import { gameAPI, API_BASE_URL } from "../../shared/utils/gameAPI";
import type { GameResponse } from "../../shared/utils/gameAPI";

interface GameUpdateMessage {
  type: string;
  [key: string]: any;
}

interface UseGameSyncOptions {
  sessionId: string;
  gameId: number;
  playerId: string;
  playerName?: string;
  userType: "teacher" | "student";
  onGameUpdate?: (message: GameUpdateMessage) => void;
  onError?: (error: string) => void;
  pollingInterval?: number;
}

/**
 * Redesigned WebSocket hook for Chain Answer game.
 *
 * Architecture:
 * 1. Attempts WebSocket connection on mount (if sessionId is truthy)
 * 2. On WS success: all communication goes through WS (words persisted server-side)
 * 3. On WS failure: retries with exponential backoff (up to 3 attempts)
 * 4. After all retries fail: falls back to REST polling
 * 5. Uses refs for callbacks to avoid stale closures & infinite re-renders
 */
export const useGameSync = ({
  sessionId,
  gameId,
  playerId,
  playerName,
  userType,
  onGameUpdate,
  onError,
  pollingInterval = 3000,
}: UseGameSyncOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const mountedRef = useRef(true);
  const hasJoinedRef = useRef(false);

  // Store callbacks in refs to avoid dependency churn
  const onGameUpdateRef = useRef(onGameUpdate);
  onGameUpdateRef.current = onGameUpdate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<
    "ws" | "polling" | "disconnected"
  >("disconnected");
  const [gameState, setGameState] = useState<GameResponse | null>(null);

  const MAX_RECONNECT_ATTEMPTS = 3;

  // ─── Polling ──────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) return; // already polling
    if (gameId <= 0 && !sessionId) return;

    console.log("[useGameSync] Starting REST polling fallback");
    setConnectionMode("polling");

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const updatedGame =
          gameId > 0
            ? await gameAPI.getGameById(gameId)
            : await gameAPI.getGameBySessionId(sessionId);
        if (!mountedRef.current) return;
        setGameState(updatedGame);
        onGameUpdateRef.current?.({
          type: "game_state_update",
          game: updatedGame,
        });
      } catch (error: any) {
        if (!mountedRef.current) return;
        console.error("[useGameSync] Polling error:", error);
        if (error.message?.includes("Not Found")) {
          stopPolling();
          setGameState((prev) =>
            prev ? { ...prev, status: "completed" } : null,
          );
          onErrorRef.current?.("Game session not found. Please rejoin.");
        }
      }
    };

    poll(); // initial fetch
    pollingTimerRef.current = setInterval(poll, pollingInterval);
  }, [gameId, sessionId, pollingInterval, stopPolling]);

  // ─── WebSocket ────────────────────────────────────────────

  const sendMessage = useCallback((message: GameUpdateMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    // Guard: don't connect without a session
    if (!sessionId) return;

    // Guard: don't create duplicate connections
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      const cleanUrl = API_BASE_URL.trim();
      const encodedSessionId = encodeURIComponent(sessionId);
      let wsUrl = "";
      if (cleanUrl.startsWith("/")) {
        const loc = window.location;
        const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
        const wsHost = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") 
          ? `${loc.hostname}:8000` 
          : loc.host;
        const pathPrefix = (loc.hostname === "localhost" || loc.hostname === "127.0.0.1") ? "" : cleanUrl;
        wsUrl = `${protocol}//${wsHost}${pathPrefix}/ws/games/chain-answer/${encodedSessionId}?user_type=${userType}`;
      } else {
        const backendUrl = new URL(cleanUrl);
        const wsProtocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
        wsUrl = `${wsProtocol}//${backendUrl.host}${backendUrl.pathname === "/" ? "" : backendUrl.pathname}/ws/games/chain-answer/${encodedSessionId}?user_type=${userType}`;
      }

      console.log(
        `[useGameSync] Connecting to WebSocket (attempt ${reconnectCountRef.current + 1}):`,
        wsUrl,
      );

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        console.log("[useGameSync] WebSocket connected ");
        setIsConnected(true);
        setConnectionMode("ws");
        reconnectCountRef.current = 0;
        stopPolling(); // kill any active polling

        // Send join message once
        if (!hasJoinedRef.current && playerId) {
          ws.send(JSON.stringify({ type: "join", player_id: playerId, player_name: playerName }));
          hasJoinedRef.current = true;
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const message = JSON.parse(event.data);

          // Ignore pong keepalive responses
          if (message.type === "pong") return;

          // ─── Handle message types ───
          if (message.type === "initial_state") {
            const chain = message.chain || [];
            const players = message.players || [];
            const gameData = message.game || {};
            const currentPlayerIndex = message.currentPlayerIndex || 0;

            setGameState({
              ...gameData,
              players,
              words: chain,
              chain,
              currentPlayerIndex,
              timer: gameData.time_per_turn || 30,
            });
          } else if (message.type === "word_submitted") {
            setGameState((prev) => {
              if (!prev) return null;
              const newWords = [...(prev.words || []), message.word];

              // Calculate next player index
              const lastPlayerIndex = prev.players.findIndex(
                (p: any) =>
                  String(p.student_id) ===
                  String(message.word.submitted_by),
              );
              const nextPlayerIndex =
                lastPlayerIndex !== -1
                  ? (lastPlayerIndex + 1) % prev.players.length
                  : prev.currentPlayerIndex || 0;

              const newPlayers = prev.players.map((p: any) => {
                if (
                  String(p.student_id) ===
                  String(message.word.submitted_by)
                ) {
                  return { ...p, ...message.player_stats };
                }
                return p;
              });

              return {
                ...prev,
                words: newWords,
                chain: newWords,
                players: newPlayers,
                currentPlayerIndex: nextPlayerIndex,
                timer: (prev as any).time_per_turn || 30,
              };
            });
          } else if (message.type === "game_started") {
            setGameState((prev) => {
              if (!prev) return null;
              
              const updatedFields: any = {
                status: "active",
                timer: (prev as any).time_per_turn || 30,
                currentPlayerIndex: 0,
              };

              if (message.starting_word) {
                updatedFields.starting_word = message.starting_word;
                const startingWordEntry = {
                  id: 1,
                  word: message.starting_word,
                  submitted_by: "system",
                  submitted_at: new Date().toISOString(),
                  is_valid: true,
                  position: 0,
                  validation_reason: null,
                };
                updatedFields.words = [startingWordEntry];
                updatedFields.chain = [startingWordEntry];
              }

              if (message.current_question_index !== undefined) {
                updatedFields.current_question_index = message.current_question_index;
              }

              return {
                ...prev,
                ...updatedFields,
              };
            });
          } else if (message.type === "new_question") {
            setGameState((prev) => {
              if (!prev) return null;
              const startingWordEntry = {
                id: 1,
                word: message.starting_word,
                submitted_by: "system",
                submitted_at: new Date().toISOString(),
                is_valid: true,
                position: 0,
                validation_reason: null,
              };
              return {
                ...prev,
                starting_word: message.starting_word,
                current_question_index: message.current_question_index,
                words: [startingWordEntry],
                chain: [startingWordEntry],
                currentPlayerIndex: 0,
                timer: (prev as any).time_per_turn || 30,
              };
            });
          } else if (message.type === "game_ended") {
            setGameState((prev) =>
              prev ? { ...prev, status: "completed" } : null,
            );
          } else if (message.type === "player_joined") {
            setGameState((prev) =>
              prev
                ? { ...prev, players: message.players || prev.players }
                : null,
            );
          } else if (message.type === "turn_skipped") {
            // Server confirmed turn skip — advance to next player, reset timer
            setGameState((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                currentPlayerIndex: message.next_player_index ?? prev.currentPlayerIndex,
                timer: message.time_per_turn || (prev as any).time_per_turn || 30,
                errorMessage: "",
              };
            });
          } else if (message.type === "error") {
            // Server sent a validation or permission error
            setGameState((prev) => {
              if (!prev) return { ...({} as any), errorMessage: message.message };
              return {
                ...prev,
                errorMessage: message.message || "An error occurred",
              };
            });
            // Auto-clear after 5 seconds
            setTimeout(() => {
              setGameState((prev) => prev ? { ...prev, errorMessage: "" } : prev);
            }, 5000);
          }

          // Forward to external callback
          onGameUpdateRef.current?.(message);
        } catch (err) {
          console.error("[useGameSync] Error parsing WS message:", err);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this, so we handle retry logic there
        console.warn("[useGameSync] WebSocket error");
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log(
          `[useGameSync] WebSocket closed (code=${event.code}, clean=${event.wasClean})`,
        );
        setIsConnected(false);

        // Retry with exponential backoff
        if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectCountRef.current),
            8000,
          );
          reconnectCountRef.current += 1;
          console.log(
            `[useGameSync] Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        } else {
          // All retries exhausted → fall back to polling
          console.warn(
            "[useGameSync] All WS reconnect attempts exhausted, falling back to polling",
          );
          setConnectionMode("polling");
          startPolling();
          onErrorRef.current?.(
            "Real-time connection lost. Using polling fallback.",
          );
        }
      };
    } catch (error) {
      console.error("[useGameSync] Failed to create WebSocket:", error);
      setConnectionMode("polling");
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userType, playerId, stopPolling, startPolling]);

  // ─── Lifecycle ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    hasJoinedRef.current = false;
    reconnectCountRef.current = 0;

    if (!sessionId) {
      // No session = nothing to connect to
      return;
    }

    // Attempt WebSocket first
    connectWebSocket();

    return () => {
      mountedRef.current = false;

      // Cancel any pending reconnect
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Stop polling
      stopPolling();

      // Close WebSocket cleanly
      const ws = wsRef.current;
      if (ws) {
        // Prevent onclose from triggering reconnection
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
        wsRef.current = null;
      }
    };
  }, [sessionId, connectWebSocket, stopPolling]);

  // ─── Timer Countdown ─────────────────────────────────────

  useEffect(() => {
    if (
      !gameState ||
      gameState.status !== "active" ||
      (gameState.timer || 0) <= 0
    )
      return;

    const interval = setInterval(() => {
      setGameState((prev) => {
        if (!prev || (prev.timer || 0) <= 0) return prev;
        return { ...prev, timer: (prev.timer || 0) - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.status, gameState?.timer, gameState?.currentPlayerIndex]);

  // ─── Heartbeat ────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected) return;

    const heartbeat = setInterval(() => {
      sendMessage({ type: "ping" });
    }, 25000);

    return () => clearInterval(heartbeat);
  }, [isConnected, sendMessage]);

  // ─── Actions ──────────────────────────────────────────────

  const submitWord = useCallback(
    (word: string) => {
      if (connectionMode === "ws" && isConnected) {
        sendMessage({
          type: "submit_word",
          word,
          player_id: playerId,
        });
      } else {
        // REST fallback
        gameAPI.submitWord(gameId, word, playerId);
      }
    },
    [gameId, playerId, connectionMode, isConnected, sendMessage],
  );

  const startGame = useCallback(() => {
    if (connectionMode === "ws" && isConnected) {
      sendMessage({ type: "start_game" });
    }
  }, [connectionMode, isConnected, sendMessage]);

  const endGame = useCallback(async () => {
    if (connectionMode === "ws" && isConnected) {
      sendMessage({ type: "end_game" });
      return;
    }
    // REST fallback
    if (gameId > 0) {
      await gameAPI.endGame(gameId);
    }
  }, [gameId, connectionMode, isConnected, sendMessage]);

  const skipTurn = useCallback(
    (skippedPlayerId: string) => {
      if (connectionMode === "ws" && isConnected) {
        sendMessage({
          type: "skip_turn",
          player_id: skippedPlayerId,
        });
      } else {
        // Local fallback — just advance the index client-side
        setGameState((prev) => {
          if (!prev) return null;
          const players = prev.players || [];
          const idx = players.findIndex(
            (p: any) =>
              String(p.student_id) === String(skippedPlayerId) ||
              String(p.id) === String(skippedPlayerId),
          );
          const nextIndex =
            idx !== -1 ? (idx + 1) % players.length : (prev.currentPlayerIndex || 0);
          return {
            ...prev,
            currentPlayerIndex: nextIndex,
            timer: (prev as any).time_per_turn || 30,
          };
        });
      }
    },
    [connectionMode, isConnected, sendMessage],
  );

  const nextQuestion = useCallback(async () => {
    if (connectionMode === "ws" && isConnected) {
      sendMessage({ type: "next_question" });
      return;
    }
    // REST fallback
    if (gameId > 0) {
      try {
        const updatedGame = await gameAPI.nextQuestion(gameId);
        setGameState(updatedGame);
      } catch (err) {
        console.error("Failed to advance question:", err);
      }
    }
  }, [gameId, connectionMode, isConnected, sendMessage]);

  return {
    isConnected,
    connectionMode,
    useWebSocket: connectionMode === "ws",
    gameState,
    submitWord,
    startGame,
    endGame,
    nextQuestion,
    skipTurn,
    sendMessage,
  };
};
