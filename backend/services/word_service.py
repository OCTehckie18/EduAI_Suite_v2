"""
Word Service — Deterministic, local word generation and validation.
Self-contained dictionary engine using nltk WordNet and a bundled fallback word bank.
"""
import logging
import os
import random
from typing import List, Optional

logger = logging.getLogger(__name__)

_nltk_ready = False
_wn = None
_all_english_words = set()

try:
    import nltk
    for corpus in ("wordnet", "omw-1.4", "words"):
        try:
            nltk.data.find(f"corpora/{corpus}")
        except LookupError:
            pass

    from nltk.corpus import wordnet as _wn
    from nltk.corpus import words as _nltk_words
    _all_english_words = set(w.lower() for w in _nltk_words.words())
    _nltk_ready = True
except Exception as e:
    logger.warning("WordService: nltk optional components not fully available, using static word bank: %s", e)
    _all_english_words = set()

TOPIC_WORD_BANK: dict[str, list[str]] = {
    "science": [
        "atom", "molecule", "cell", "energy", "force", "gravity", "electron",
        "neutron", "proton", "nucleus", "photon", "wave", "frequency", "voltage",
        "current", "resistance", "circuit", "magnet", "friction", "velocity",
        "acceleration", "momentum", "density", "mass", "volume", "pressure",
        "temperature", "thermometer", "microscope", "telescope", "hypothesis",
        "experiment", "observation", "conclusion", "data", "variable", "element",
        "compound", "mixture", "solution", "acid", "base", "reaction", "catalyst",
        "enzyme", "bacteria", "virus", "organism", "species", "evolution",
    ],
    "animals": [
        "elephant", "tiger", "lion", "giraffe", "zebra", "monkey", "rabbit",
        "dolphin", "whale", "shark", "penguin", "eagle", "parrot", "snake",
        "turtle", "frog", "crocodile", "bear", "wolf", "fox", "deer", "horse",
        "cow", "goat", "sheep", "chicken", "duck", "swan", "octopus", "butterfly",
        "ant", "bee", "spider", "scorpion", "crab", "lobster", "starfish",
        "jellyfish", "salmon", "trout", "owl", "hawk", "flamingo", "peacock",
        "kangaroo", "koala", "panda", "gorilla", "cheetah", "leopard",
    ],
    "geography": [
        "mountain", "river", "ocean", "island", "continent", "desert", "forest",
        "valley", "plateau", "volcano", "glacier", "canyon", "delta", "peninsula",
        "archipelago", "tundra", "savanna", "prairie", "reef", "basin", "cape",
        "strait", "channel", "lagoon", "cliff", "dune", "fjord", "geyser",
        "marsh", "swamp", "tributary", "waterfall", "earthquake", "tsunami",
        "hurricane", "tornado", "climate", "weather", "latitude", "longitude",
        "equator", "hemisphere", "tropics", "arctic", "antarctic", "border",
        "territory", "nation", "capital", "province",
    ],
    "history": [
        "empire", "dynasty", "revolution", "colony", "treaty", "constitution",
        "monarchy", "republic", "democracy", "feudalism", "crusade", "renaissance",
        "reformation", "enlightenment", "industrial", "civilization", "pharaoh",
        "gladiator", "knight", "samurai", "emperor", "congress", "parliament",
        "independence", "slavery", "abolition", "suffrage", "migration",
        "archaeology", "artifact", "monument", "heritage", "legacy", "chronicle",
        "manuscript", "conquest", "rebellion", "alliance", "armistice", "siege",
        "fortification", "castle", "cathedral", "temple", "pyramid", "tomb",
        "excavation", "inscription", "relic",
    ],
    "mathematics": [
        "number", "equation", "fraction", "decimal", "integer", "variable",
        "function", "graph", "slope", "intercept", "polynomial", "quadratic",
        "linear", "exponential", "logarithm", "matrix", "vector", "scalar",
        "calculus", "derivative", "integral", "limit", "sequence", "series",
        "probability", "statistics", "median", "mode", "range", "deviation",
        "theorem", "proof", "axiom", "formula", "geometry", "triangle",
        "circle", "rectangle", "polygon", "angle", "perimeter", "area",
        "volume", "diameter", "radius", "circumference", "symmetry", "congruent",
        "parallel", "perpendicular",
    ],
    "sports": [
        "football", "basketball", "cricket", "tennis", "baseball", "hockey",
        "volleyball", "badminton", "swimming", "cycling", "running", "sprint",
        "marathon", "javelin", "discus", "hurdle", "relay", "gymnastics",
        "wrestling", "boxing", "fencing", "archery", "rowing", "sailing",
        "surfing", "diving", "skating", "skiing", "snowboard", "golf",
        "rugby", "polo", "squash", "handball", "lacrosse", "referee",
        "umpire", "stadium", "tournament", "championship", "medal", "trophy",
        "coach", "athlete", "score", "goal", "penalty", "foul",
        "dribble", "serve",
    ],
    "food": [
        "apple", "banana", "orange", "grape", "mango", "strawberry", "blueberry",
        "cherry", "peach", "pear", "watermelon", "pineapple", "coconut", "lemon",
        "tomato", "potato", "carrot", "onion", "garlic", "pepper", "broccoli",
        "spinach", "lettuce", "cucumber", "corn", "mushroom", "rice", "wheat",
        "bread", "butter", "cheese", "milk", "yogurt", "chicken", "beef",
        "salmon", "shrimp", "pasta", "noodle", "soup", "salad", "sandwich",
        "pizza", "burger", "chocolate", "cookie", "cake", "pie", "pudding",
        "pancake",
    ],
    "general": [
        "apple", "elephant", "train", "table", "rabbit", "dog", "goat",
        "tree", "giraffe", "egg", "bat", "ant", "zebra", "astronaut",
        "ball", "car", "fan", "game", "hat", "ice", "jam", "king",
        "lion", "mouse", "nest", "orange", "quiz", "sun",
        "turtle", "umbrella", "violin", "whale", "xylophone", "yak", "zone",
        "science", "history", "physics", "chemistry", "biology", "geography",
        "book", "pen", "desk", "chair", "window", "door", "house", "school",
        "college", "university", "doctor", "engineer", "teacher", "student",
        "water", "fire", "air", "earth", "sky", "cloud", "rain", "snow",
        "mountain", "river", "ocean", "forest", "garden", "bridge", "tower",
        "castle", "planet", "star", "moon", "comet", "galaxy", "universe",
    ],
}

_MASTER_WORD_SET: set[str] = set()
for _words in TOPIC_WORD_BANK.values():
    _MASTER_WORD_SET.update(w.lower() for w in _words)


def _match_topic(subject: str) -> str:
    subject_lower = subject.lower().strip()
    for key in TOPIC_WORD_BANK:
        if key in subject_lower or subject_lower in key:
            return key
    for key in TOPIC_WORD_BANK:
        if any(part in key for part in subject_lower.split()):
            return key
    return "general"


class WordService:
    @staticmethod
    def is_valid_english_word(word: str) -> bool:
        w = word.lower().strip()
        if _nltk_ready and w in _all_english_words:
            return True
        return w in _MASTER_WORD_SET

    @staticmethod
    def generate_word_suggestions(
        subject: str,
        difficulty: str = "medium",
        count: int = 5,
        chain_variation: str = "standard",
        starting_word: str = "apple",
    ) -> List[str]:
        topic_key = _match_topic(subject)
        candidates: List[str] = []

        if _nltk_ready and _wn is not None:
            try:
                synsets = _wn.synsets(topic_key)
                for syn in synsets[:10]:
                    for lemma in syn.lemmas():
                        w = lemma.name().replace("_", " ").lower()
                        if w.isalpha() and 2 <= len(w) <= 15:
                            candidates.append(w)
            except Exception:
                pass

        static_words = TOPIC_WORD_BANK.get(topic_key, TOPIC_WORD_BANK["general"])
        candidates.extend(static_words)

        if difficulty == "easy":
            candidates = [w for w in candidates if len(w) <= 6]
        elif difficulty == "hard":
            candidates = [w for w in candidates if len(w) >= 7]

        candidates = list(set(candidates))
        random.shuffle(candidates)

        if chain_variation == "standard" and starting_word:
            required_letter = starting_word[-1].lower()
            chained = [w for w in candidates if w.startswith(required_letter)]
            if len(chained) >= count:
                candidates = chained

        return candidates[:count]

    @staticmethod
    def validate_word(
        word: str,
        previous_word: str,
        chain_variation: str,
        used_words: List[str],
        subject: Optional[str] = None,
    ) -> dict:
        word_lower = word.lower().strip()
        result = {
            "is_valid": False,
            "message": "",
            "validation_source": "local",
            "suggestions": [],
        }

        if not word_lower or not word_lower.isalpha():
            result["message"] = "Word must contain only letters"
            return result

        if len(word_lower) < 2:
            result["message"] = "Word is too short (minimum 2 letters)"
            return result

        if not WordService.is_valid_english_word(word_lower):
            result["message"] = "Word not found in dictionary"
            return result

        if word_lower in [w.lower() for w in used_words]:
            result["message"] = "Word already used in this game"
            return result

        if chain_variation == "standard" and previous_word:
            required = previous_word[-1].lower()
            if word_lower[0] != required:
                result["message"] = f"Must start with '{required}'"
                return result

        elif chain_variation == "compound" and previous_word:
            if len(previous_word) >= 2 and len(word_lower) >= 2:
                required = previous_word[-2:].lower()
                if word_lower[:2] != required:
                    result["message"] = f"Must start with '{required}'"
                    return result

        elif chain_variation == "ladder" and previous_word:
            if len(word_lower) != len(previous_word):
                result["message"] = f"Must be {len(previous_word)} letters long"
                return result
            diffs = sum(1 for a, b in zip(word_lower, previous_word.lower()) if a != b)
            if diffs != 1:
                result["message"] = "Must differ by exactly one letter"
                return result

        elif chain_variation == "category" and subject:
            topic_key = _match_topic(subject)
            topic_words = set(w.lower() for w in TOPIC_WORD_BANK.get(topic_key, []))
            if word_lower not in topic_words and not WordService.is_valid_english_word(word_lower):
                result["message"] = f"Word not recognized for category '{subject}'"
                return result

        result["is_valid"] = True
        result["message"] = "Valid word"
        return result
