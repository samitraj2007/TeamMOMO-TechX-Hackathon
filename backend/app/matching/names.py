"""Phase 0 name keys: normalised, article-free, order-insensitive. Phase 2 adds fuzzy/transliteration."""

import re
import unicodedata

_AR_DIACRITICS = re.compile(r"[\u064B-\u065F\u0670\u0640]")
_AR_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})
_LATIN_ARTICLES = {"al", "el"}


def _strip_marks(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def latin_key(name: str) -> tuple[str, ...]:
    s = re.sub(r"[^a-z\s]", " ", _strip_marks(name).lower())
    tokens = [t for t in s.split() if t not in _LATIN_ARTICLES]
    return tuple(sorted(tokens))


def arabic_key(name: str) -> tuple[str, ...]:
    s = _AR_DIACRITICS.sub("", unicodedata.normalize("NFKC", name)).translate(_AR_FOLD)
    s = re.sub(r"[^\u0621-\u064A\s]", " ", s)
    tokens = [t[2:] if t.startswith("ال") and len(t) > 3 else t for t in s.split()]
    return tuple(sorted(tokens))
