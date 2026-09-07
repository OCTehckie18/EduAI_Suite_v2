import type {
  WordValidationRequest,
  WordValidationResponse,
} from "./types";

// Word validation service
export class WordValidator {
  // Mock dictionary - in production, this would be from backend
  private static dictionary = new Set([
    "apple",
    "elephant",
    "train",
    "cat",
    "tiger",
    "rabbit",
    "dog",
    "goat",
    "tree",
    "giraffe",
    "egg",
    "table",
    "bat",
    "ant",
    "zebra",
    "astronaut",
    "ball",
    "car",
    "doll",
    "egg",
    "fan",
    "game",
    "hat",
    "ice",
    "jam",
    "king",
    "lion",
    "mouse",
    "nest",
    "orange",
    "pig",
    "quiz",
    "rat",
    "sun",
    "turtle",
    "umbrella",
    "violin",
    "whale",
    "xylophone",
    "yak",
    "zone",
  ]);

  private static categories = {
    animals: [
      "cat",
      "tiger",
      "rabbit",
      "dog",
      "goat",
      "giraffe",
      "elephant",
      "lion",
      "mouse",
      "pig",
      "rat",
      "whale",
      "yak",
      "ant",
      "zebra",
    ],
    objects: [
      "apple",
      "egg",
      "table",
      "ball",
      "car",
      "doll",
      "fan",
      "hat",
      "jam",
      "nest",
      "orange",
      "quiz",
      "sun",
      "umbrella",
      "violin",
      "xylophone",
      "zone",
    ],
    geography: [
      "cairo",
      "oxford",
      "damascus",
      "london",
      "paris",
      "rome",
      "berlin",
      "madrid",
      "lisbon",
      "athens",
    ],
  };

  static validate(request: WordValidationRequest): WordValidationResponse {
    const word = request.word.toLowerCase().trim();

    // Check if word is empty
    if (!word) {
      return {
        isValid: false,
        status: "invalid",
        reason: "Word cannot be empty",
        reason_code: "EMPTY_WORD",
      };
    }

    // Check if word already used
    if (request.usedWords.includes(word)) {
      return {
        isValid: false,
        status: "invalid",
        reason: `Word "${word}" has already been used in this chain`,
        reason_code: "DUPLICATE_WORD",
      };
    }

    // Check if word exists in dictionary
    if (!this.dictionary.has(word)) {
      return {
        isValid: false,
        status: "invalid",
        reason: `Word "${word}" not found in dictionary`,
        reason_code: "WORD_NOT_FOUND",
      };
    }

    // Validate based on chain variation
    const chainValidation = this.validateChainRule(
      word,
      request.previousWord,
      request.chainVariation,
    );
    if (!chainValidation.isValid) {
      return chainValidation;
    }

    // Validate category if specified
    if (request.category) {
      const categoryValidation = this.validateCategory(word, request.category);
      if (!categoryValidation.isValid) {
        return categoryValidation;
      }
    }

    return {
      isValid: true,
      status: "valid",
      reason: `Valid word! "${word}" follows the ${request.chainVariation} chain rule.`,
    };
  }

  private static validateChainRule(
    word: string,
    previousWord: string,
    variation: string,
  ): WordValidationResponse {
    const prev = previousWord.toLowerCase();
    const curr = word.toLowerCase();

    switch (variation) {
      case "standard":
        // Last letter of previous = first letter of current
        if (prev[prev.length - 1] !== curr[0]) {
          return {
            isValid: false,
            status: "invalid",
            reason: `"${word}" must start with "${prev[prev.length - 1]}"`,
            reason_code: "INVALID_CHAIN_RULE",
          };
        }
        break;

      case "category":
        // Same as standard but with category validation (handled separately)
        if (prev[prev.length - 1] !== curr[0]) {
          return {
            isValid: false,
            status: "invalid",
            reason: `"${word}" must start with "${prev[prev.length - 1]}"`,
            reason_code: "INVALID_CHAIN_RULE",
          };
        }
        break;

      case "ladder":
        // Change exactly one letter
        if (curr.length !== prev.length) {
          return {
            isValid: false,
            status: "invalid",
            reason: "Word ladder requires same word length",
            reason_code: "INVALID_LADDER_LENGTH",
          };
        }
        let diffCount = 0;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] !== curr[i]) diffCount++;
        }
        if (diffCount !== 1) {
          return {
            isValid: false,
            status: "invalid",
            reason: "Word ladder requires exactly one letter change",
            reason_code: "INVALID_LADDER_DIFF",
          };
        }
        break;

      case "compound":
        // Last syllable/word combines with next (simplified: last 2+ chars match first 2+ chars)
        const overlapLen = Math.min(2, prev.length, curr.length);
        if (prev.slice(-overlapLen) !== curr.slice(0, overlapLen)) {
          return {
            isValid: false,
            status: "invalid",
            reason: `"${word}" must overlap with "${prev}"`,
            reason_code: "INVALID_COMPOUND",
          };
        }
        break;

      case "geography":
        // Same as standard for chain rule, but category validation happens separately
        if (prev[prev.length - 1] !== curr[0]) {
          return {
            isValid: false,
            status: "invalid",
            reason: `"${word}" must start with "${prev[prev.length - 1]}"`,
            reason_code: "INVALID_CHAIN_RULE",
          };
        }
        break;
    }

    return { isValid: true, status: "valid", reason: "Chain rule validated" };
  }

  private static validateCategory(
    word: string,
    category: string,
  ): WordValidationResponse {
    const categoryWords =
      this.categories[category as keyof typeof this.categories];
    if (!categoryWords) {
      return {
        isValid: false,
        status: "invalid",
        reason: "Unknown category",
        reason_code: "UNKNOWN_CATEGORY",
      };
    }
    if (!categoryWords.includes(word.toLowerCase())) {
      return {
        isValid: false,
        status: "invalid",
        reason: `"${word}" is not in the ${category} category`,
        reason_code: "INVALID_CATEGORY",
      };
    }
    return { isValid: true, status: "valid", reason: "Category validated" };
  }

  static getSuggestions(prefix: string, category?: string): string[] {
    return Array.from(this.dictionary)
      .filter((word) => word.startsWith(prefix.toLowerCase()))
      .filter((word) => {
        if (!category) return true;
        const categoryWords =
          this.categories[category as keyof typeof this.categories];
        return categoryWords?.includes(word) || false;
      })
      .slice(0, 5);
  }
}
