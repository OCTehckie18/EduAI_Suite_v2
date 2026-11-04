// Student-side API for the Chain Answer game. Games are always addressed by their session id (for
// example "game_a1b2c3d4"); the server decides who the player is from the login, so no name or
// student id is ever sent.
import { API_BASE_URL } from "./apiConfig";
export { API_BASE_URL } from "./apiConfig";

export interface ChainPlayer {
  id: number;
  student_id: number | null;
  name: string;
  join_order: number;
  score: number;
  words_submitted: number;
  words_valid: number;
  status: string;
}

export interface ChainWord {
  id: number;
  word: string;
  submitted_by: string | null;
  submitted_at: string;
  is_valid: boolean;
  position: number | null;
  validation_reason: string | null;
}

export type GameStatus = "setup" | "active" | "paused" | "completed";

/** The game exactly as the server sends it. Turn, timer and chain are worked out there. */
export interface GameResponse {
  id: number;
  session_id: string;
  name: string;
  chain_variation: "standard" | "compound" | "ladder" | "category";
  category?: string | null;
  subject?: string | null;
  status: GameStatus;
  starting_word: string;
  time_per_turn: number;
  max_words?: number | null;
  penalty_on_invalid: boolean;
  players: ChainPlayer[];
  words: ChainWord[];
  chain: ChainWord[];
  current_player_id: number | null;
  current_player_index: number | null;
  /** Seconds left on the current turn when the snapshot was made (null when nothing is running). */
  time_left: number | null;
  server_time: string;
}

/** A failed request, carrying the server's message so it can be shown to the student. */
export class GameRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}/games${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GameRequestError(body.detail || body.error?.message || "The request failed.", response.status);
  }
  return body as T;
};

class ChainAnswerGameAPI {
  /** The games this student has joined. */
  listMyGames(): Promise<GameResponse[]> {
    return request<GameResponse[]>("/chain-answer");
  }

  getGame(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(`/chain-answer/${encodeURIComponent(sessionId)}`);
  }

  joinGame(sessionId: string): Promise<ChainPlayer> {
    return request<ChainPlayer>(`/chain-answer/${encodeURIComponent(sessionId)}/join`, { method: "POST", body: "{}" });
  }

  /** Used only when the live connection is down. The word is checked and scored on the server. */
  submitWord(
    sessionId: string,
    word: string,
  ): Promise<{ word: ChainWord; validation: { is_valid: boolean; message: string }; game: GameResponse }> {
    return request(`/chain-answer/${encodeURIComponent(sessionId)}/words`, {
      method: "POST",
      body: JSON.stringify({ word }),
    });
  }
}

export const gameAPI = new ChainAnswerGameAPI();
