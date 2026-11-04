// Teacher-side API for the Chain Answer game. A game is always addressed by its session id (for
// example "game_a1b2c3d4"). The server records the teacher from the login, so no teacher id is sent.
import { API_BASE_URL } from "./apiConfig";
export { API_BASE_URL } from "./apiConfig";

export interface GamePlayer {
  student_id: number;
}

export interface Student {
  id: number;
  name: string;
  email: string;
  registration_number: string;
  student_class: string;
  department: string;
  course_id: number;
  attendance: number | null;
  avg_score: number | null;
}

export type ChainVariation = "standard" | "category" | "compound" | "ladder";

export interface ChainAnswerGameConfig {
  name: string;
  chain_variation: ChainVariation;
  category?: string;
  difficulty_level: string;
  language: string;
  subject?: string;
  starting_word: string;
  time_per_turn: number;
  max_words?: number;
  penalty_on_invalid: boolean;
  penalty_type?: string;
  players: GamePlayer[];
}

export interface GamePlayerRow {
  id: number;
  student_id: number | null;
  name: string;
  join_order: number;
  score: number;
  words_submitted: number;
  words_valid: number;
  status: string;
}

export interface GameWordRow {
  id: number;
  word: string;
  submitted_by: string | null;
  submitted_at: string;
  is_valid: boolean;
  position: number | null;
  validation_reason: string | null;
}

export type GameStatus = "setup" | "active" | "paused" | "completed";

export interface GameResponse {
  id: number;
  session_id: string;
  name: string;
  chain_variation: ChainVariation;
  category?: string | null;
  subject?: string | null;
  difficulty_level: string;
  status: GameStatus;
  starting_word: string;
  time_per_turn: number;
  max_words?: number | null;
  penalty_on_invalid: boolean;
  players: GamePlayerRow[];
  words: GameWordRow[];
  chain: GameWordRow[];
  current_player_id: number | null;
  current_player_index: number | null;
  time_left: number | null;
  server_time: string;
}

/** A failed request, carrying the server's own message so it can be shown to the teacher. */
export class GameRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GameRequestError(body.detail || body.error?.message || "The request failed.", response.status);
  }
  return body as T;
};

const game = (sessionId: string) => `/games/chain-answer/${encodeURIComponent(sessionId)}`;

class ChainAnswerGameAPI {
  /** The students enrolled in one of your courses. */
  getActiveStudents(courseId: number): Promise<Student[]> {
    return request<Student[]>(`/students/${courseId}/active`);
  }

  createGame(config: ChainAnswerGameConfig): Promise<GameResponse> {
    return request<GameResponse>("/games/chain-answer", { method: "POST", body: JSON.stringify(config) });
  }

  /** Your own games. */
  getAllGames(): Promise<GameResponse[]> {
    return request<GameResponse[]>("/games/chain-answer");
  }

  getGame(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(game(sessionId));
  }

  startGame(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(`${game(sessionId)}/start`, { method: "POST", body: "{}" });
  }

  pauseGame(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(`${game(sessionId)}/pause`, { method: "POST", body: "{}" });
  }

  resumeGame(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(`${game(sessionId)}/resume`, { method: "POST", body: "{}" });
  }

  /** Move to the next player now. */
  skipTurn(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(`${game(sessionId)}/skip`, { method: "POST", body: "{}" });
  }

  endGame(sessionId: string): Promise<GameResponse> {
    return request<GameResponse>(`${game(sessionId)}/end`, { method: "POST", body: "{}" });
  }

  deleteGame(sessionId: string): Promise<void> {
    return request<void>(game(sessionId), { method: "DELETE" });
  }
}

export const gameAPI = new ChainAnswerGameAPI();
