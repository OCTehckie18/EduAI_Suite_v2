import { useCallback, useEffect, useRef, useState } from "react";
import { gameAPI, GameRequestError } from "../../shared/utils/gameAPI";
import type { GameResponse } from "../../shared/utils/gameAPI";
import { buildWsUrl } from "../../shared/utils/apiConfig";
import { getCurrentAccessToken } from "../../shared/utils/currentStudent";

export type ConnectionMode = "connecting" | "live" | "polling" | "closed";

export interface WordFeedback {
  word: string;
  isValid: boolean;
  reason: string;
}

// Close codes the server uses to explain why it refused a connection.
const FATAL_CLOSE: Record<number, string> = {
  4401: "Your session has expired. Please sign in again.",
  4403: "This game is not available to you.",
  4404: "That game was not found.",
};

const MAX_RECONNECTS = 4;
const POLL_MS = 2000;

interface Options {
  sessionId: string;
  /** Called when the game can never work for this student (not found, not allowed, signed out). */
  onFatal?: (message: string) => void;
}

/**
 * Keeps one student's view of a Chain Answer game up to date.
 *
 * The server is the single source of truth: every message is a full snapshot of the game (whose turn
 * it is, the chain, scores, time left), so the screen never works any of that out for itself. A live
 * WebSocket is used when it can connect; otherwise the game is polled over plain HTTP, which works the
 * same way because the server applies turn timeouts whenever the game is read.
 */
export const useGameSync = ({ sessionId, onFatal }: Options) => {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [mode, setMode] = useState<ConnectionMode>("connecting");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<WordFeedback | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [fatal, setFatal] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const aliveRef = useRef(true);
  const receivedAtRef = useRef(0);
  const onFatalRef = useRef(onFatal);
  onFatalRef.current = onFatal;

  const accept = useCallback((next: GameResponse) => {
    receivedAtRef.current = Date.now();
    setGame(next);
  }, []);

  const giveUp = useCallback((message: string) => {
    setFatal(message);
    setMode("closed");
    onFatalRef.current?.(message);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    setMode("polling");
    const poll = async () => {
      try {
        const next = await gameAPI.getGame(sessionId);
        if (aliveRef.current) {
          accept(next);
          setError("");
        }
      } catch (err) {
        if (!aliveRef.current) return;
        if (err instanceof GameRequestError && [401, 403, 404].includes(err.status)) {
          stopPolling();
          giveUp(err.status === 404 ? FATAL_CLOSE[4404] : err.status === 401 ? FATAL_CLOSE[4401] : FATAL_CLOSE[4403]);
        } else {
          setError("Connection problem. Trying again...");
        }
      }
    };
    void poll();
    pollRef.current = setInterval(poll, POLL_MS);
  }, [sessionId, accept, giveUp, stopPolling]);

  const connect = useCallback(() => {
    const token = getCurrentAccessToken();
    if (!token) {
      giveUp(FATAL_CLOSE[4401]);
      return;
    }
    const url = buildWsUrl(`/ws/games/chain-answer/${encodeURIComponent(sessionId)}?access_token=${encodeURIComponent(token)}`);
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      attemptsRef.current = 0;
      stopPolling();
      setMode("live");
      setError("");
      socket.send(JSON.stringify({ type: "join" })); // the server adds this student if they are not in yet
    };

    socket.onmessage = (event) => {
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "state") {
        accept(message.game as GameResponse);
        if (message.event === "word_rejected" && message.detail?.word) {
          setFeedback({ word: message.detail.word, isValid: false, reason: message.detail.reason });
        } else if (message.event === "word_accepted" || message.event === "turn_skipped") {
          setFeedback(null);
        }
        setError("");
      } else if (message.type === "error") {
        setError(message.message || "Something went wrong.");
      }
    };

    socket.onclose = (event) => {
      if (!aliveRef.current) return;
      if (FATAL_CLOSE[event.code]) {
        giveUp(FATAL_CLOSE[event.code]);
        return;
      }
      if (attemptsRef.current < MAX_RECONNECTS) {
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 8000);
        attemptsRef.current += 1;
        setMode("connecting");
        retryRef.current = setTimeout(() => aliveRef.current && connect(), delay);
      } else {
        startPolling();
      }
    };
  }, [sessionId, accept, giveUp, startPolling, stopPolling]);

  useEffect(() => {
    aliveRef.current = true;
    attemptsRef.current = 0;
    setGame(null);
    setFatal("");
    setMode("connecting");
    // Show the game straight away from a plain request; the live connection then keeps it current.
    gameAPI.getGame(sessionId).then((first) => aliveRef.current && accept(first)).catch(() => undefined);
    connect();
    return () => {
      aliveRef.current = false;
      stopPolling();
      if (retryRef.current) clearTimeout(retryRef.current);
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, [sessionId, connect, accept, stopPolling]);

  // Keep the connection alive through proxies.
  useEffect(() => {
    if (mode !== "live") return;
    const timer = setInterval(() => socketRef.current?.readyState === WebSocket.OPEN && socketRef.current.send('{"type":"ping"}'), 25000);
    return () => clearInterval(timer);
  }, [mode]);

  // A display-only countdown between server snapshots. The server enforces the real deadline.
  useEffect(() => {
    if (!game || game.status !== "active" || game.time_left == null) {
      setSecondsLeft(game?.status === "paused" ? game.time_left : null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil(game.time_left! - (Date.now() - receivedAtRef.current) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [game]);

  const submitWord = useCallback(
    async (word: string) => {
      setFeedback(null);
      if (mode === "live" && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "submit_word", word }));
        return;
      }
      try {
        const result = await gameAPI.submitWord(sessionId, word);
        accept(result.game);
        setError("");
        if (!result.validation.is_valid) setFeedback({ word, isValid: false, reason: result.validation.message });
      } catch (err) {
        setError(err instanceof Error ? err.message : "The word could not be sent.");
      }
    },
    [mode, sessionId, accept],
  );

  return { game, mode, error, feedback, secondsLeft, fatal, submitWord };
};
