// Scoring service for Chain Answer Game

export interface ScoreModifiers {
  basePoints: number;
  difficultyBonus: number;
  speedBonus: number;
  chainLengthBonus: number;
  penaltyPoints: number;
}

export class ScoringService {
  private static readonly BASE_POINTS = 10;
  private static readonly DIFFICULTY_MULTIPLIER = {
    easy: 1,
    medium: 1.5,
    hard: 2,
  };
  private static readonly CHAIN_LENGTH_THRESHOLD = 5;
  private static readonly CHAIN_LENGTH_BONUS = 5;
  private static readonly SPEED_THRESHOLD_SECONDS = 5;
  private static readonly SPEED_BONUS = 3;
  private static readonly INVALID_WORD_PENALTY = 5;
  private static readonly SKIP_TURN_PENALTY = 2;

  static calculatePointsForWord(
    difficulty: "easy" | "medium" | "hard",
    responseTimeSeconds: number,
    chainLength: number,
    wordLength: number,
  ): ScoreModifiers {
    let points = this.BASE_POINTS;
    const modifiers: ScoreModifiers = {
      basePoints: points,
      difficultyBonus: 0,
      speedBonus: 0,
      chainLengthBonus: 0,
      penaltyPoints: 0,
    };

    // Difficulty bonus
    const diffBonus = Math.round(
      points * (this.DIFFICULTY_MULTIPLIER[difficulty] - 1),
    );
    modifiers.difficultyBonus = diffBonus;
    points += diffBonus;

    // Speed bonus (faster = more points)
    if (responseTimeSeconds < this.SPEED_THRESHOLD_SECONDS) {
      modifiers.speedBonus = this.SPEED_BONUS;
      points += this.SPEED_BONUS;
    }

    // Chain length bonus (every N words)
    if (chainLength > 0 && chainLength % this.CHAIN_LENGTH_THRESHOLD === 0) {
      modifiers.chainLengthBonus = this.CHAIN_LENGTH_BONUS;
      points += this.CHAIN_LENGTH_BONUS;
    }

    // Word length bonus (longer words = more interesting)
    if (wordLength > 8) {
      points += 2;
    } else if (wordLength > 5) {
      points += 1;
    }

    return modifiers;
  }

  static getInvalidWordPenalty(): number {
    return this.INVALID_WORD_PENALTY;
  }

  static getSkipTurnPenalty(): number {
    return this.SKIP_TURN_PENALTY;
  }

  static calculateTotalScore(allModifiers: ScoreModifiers[]): number {
    return allModifiers.reduce((sum, mod) => {
      return (
        sum +
        mod.basePoints +
        mod.difficultyBonus +
        mod.speedBonus +
        mod.chainLengthBonus -
        mod.penaltyPoints
      );
    }, 0);
  }

  static getAchievements(
    score: number,
    chainLength: number,
    validWordsCount: number,
  ): string[] {
    const achievements: string[] = [];

    if (chainLength >= 50) {
      achievements.push("chain-master");
    }
    if (validWordsCount >= 20) {
      achievements.push("vocabulary-expert");
    }
    if (score >= 500) {
      achievements.push("scoring-star");
    }
    if (chainLength >= 100) {
      achievements.push("endless-chains");
    }

    return achievements;
  }
}
