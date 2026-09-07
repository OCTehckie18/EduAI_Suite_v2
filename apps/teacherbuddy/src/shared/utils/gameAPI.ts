// API service for Chain Answer Game backend integration
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
  attendance: number;
  avg_score: number;
}

export interface ChainAnswerGameConfig {
  name: string;
  chain_variation: string;
  category?: string;
  difficulty_level: string;
  language: string;
  starting_word: string;
  time_per_turn: number;
  max_words?: number;
  penalty_on_invalid: boolean;
  penalty_type?: string;
  players: GamePlayer[];
}

export interface GameResponse {
  id: number;
  session_id: string;
  name: string;
  chain_variation: string;
  difficulty_level: string;
  status: string;
  starting_word: string;
  players: any[];
  words: any[];
}

class ChainAnswerGameAPI {
  private baseUrl: string;
  private studentUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/games`;
    this.studentUrl = `${API_BASE_URL}/students`;
  }

  /**
   * Get active students for a course
   */
  async getActiveStudents(courseId: number): Promise<Student[]> {
    try {
      const response = await fetch(`${this.studentUrl}/${courseId}/active`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch students: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching active students:", error);
      throw error;
    }
  }

  /**
   * Create a new Chain Answer game
   */
  async createGame(config: ChainAnswerGameConfig): Promise<GameResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chain-answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`Failed to create game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating game:", error);
      throw error;
    }
  }

  /**
   * Get all Chain Answer games
   */
  async getAllGames(
    status?: string,
    skip: number = 0,
    limit: number = 100,
  ): Promise<GameResponse[]> {
    try {
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });

      if (status) {
        params.append("status_filter", status);
      }

      const response = await fetch(
        `${this.baseUrl}/chain-answer?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch games: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching games:", error);
      throw error;
    }
  }

  /**
   * Get a specific game by ID
   */
  async getGameById(gameId: number): Promise<GameResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chain-answer/${gameId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching game:", error);
      throw error;
    }
  }

  /**
   * Get a specific game by session ID
   */
  async getGameBySessionId(sessionId: string): Promise<GameResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chain-answer/session/${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching game:", error);
      throw error;
    }
  }

  /**
   * Start a game
   */
  async startGame(gameId: number): Promise<GameResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chain-answer/${gameId}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to start game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error starting game:", error);
      throw error;
    }
  }

  /**
   * Submit a word to the game
   */
  async submitWord(
    gameId: number,
    word: string,
    submittedBy: string,
    isValid: boolean = true,
    validationReason?: string,
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chain-answer/${gameId}/word`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            word,
            submitted_by: submittedBy,
            is_valid: isValid,
            validation_reason: validationReason,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to submit word: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error submitting word:", error);
      throw error;
    }
  }

  /**
   * End a game
   */
  async endGame(gameId: number): Promise<GameResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chain-answer/${gameId}/end`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to end game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error ending game:", error);
      throw error;
    }
  }

  /**
   * Pause a game
   */
  async pauseGame(gameId: number): Promise<GameResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chain-answer/${gameId}/pause`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to pause game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error pausing game:", error);
      throw error;
    }
  }

  /**
   * Resume a game
   */
  async resumeGame(gameId: number): Promise<GameResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chain-answer/${gameId}/resume`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to resume game: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error resuming game:", error);
      throw error;
    }
  }

  /**
   * Delete a game
   */
  async deleteGame(gameId: number): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/chain-answer/${gameId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete game: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error deleting game:", error);
      throw error;
    }
  }
}

export const gameAPI = new ChainAnswerGameAPI();
