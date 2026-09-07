// Chain Answer Game Type Definitions

export type ChainVariation =
  | "standard"
  | "category"
  | "compound"
  | "ladder"
  | "geography";

export type GameStatus = "setup" | "active" | "completed" | "paused";
export type PlayerStatus = "active" | "eliminated" | "skipped";
export type ValidationStatus = "valid" | "invalid" | "pending";

export interface GameSession {
  id: string;
  teacherId: string;
  name: string;
  chainVariation: ChainVariation;
  category?: string;
  difficultyLevel: "easy" | "medium" | "hard";
  language: string;
  status: GameStatus;
  startingWord: string;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export interface GamePlayer {
  id: string;
  sessionId: string;
  studentId: string;
  name: string;
  joinOrder: number;
  score: number;
  wordsSubmitted: number;
  wordsValid: number;
  status: PlayerStatus;
}

export interface GameWord {
  id: string;
  sessionId: string;
  word: string;
  submittedBy: string;
  submittedAt: Date;
  isValid: boolean;
  position: number;
  validationReason?: string;
}

export interface WordValidationRequest {
  word: string;
  previousWord: string;
  chainVariation: ChainVariation;
  category?: string;
  usedWords: string[];
}

export interface WordValidationResponse {
  isValid: boolean;
  status: ValidationStatus;
  reason: string;
  reason_code?: string;
}

export interface ChainState {
  words: GameWord[];
  currentPlayerIndex: number;
  players: GamePlayer[];
}

export interface GameConfig {
  chainVariation: ChainVariation;
  category?: string;
  difficultyLevel: "easy" | "medium" | "hard";
  language: string;
  timePerTurn: number;
  maxWords?: number;
  penaltyOnInvalid?: boolean;
  penaltyType?: "skip_turn" | "lose_points" | "elimination";
}

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

