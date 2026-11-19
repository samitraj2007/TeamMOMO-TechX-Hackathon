"""Layer 1a: Unicode normalisation that keeps an index map back to the raw text (for UI highlighting)."""

import unicodedata
from dataclasses import dataclass, field

MAX_SCAN_CHARS = 500
MAX_FIELD_CHARS = 280

ZERO_WIDTH = {"\u200b", "\u200c", "\u200d", "\u2060", "\u2061", "\u2062", "\u2063", "\u2064", "\ufeff", "\u00ad",
              "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"}
BIDI_MARKS = {"\u200e", "\u200f", "\u061c"}
HOMOGLYPHS = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
    "ԁ": "d", "һ": "h", "ӏ": "l", "α": "a", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p",
    "τ": "t", "υ": "u", "χ": "x",
}
AR_FOLD = str.maketrans({"ة": "ه", "ى": "ي", "ٱ": "ا"})


@dataclass
class Normalised:
    raw: str
    text: str
    index_map: list[int]
    zero_width: int = 0
    homoglyphs: int = 0
    oversize: bool = False
    has_latin: bool = field(default=False)

    def raw_span(self, start: int, end: int) -> tuple[int, int]:
        return self.index_map[start], self.index_map[end - 1] + 1


def normalise(raw: str) -> Normalised:
    oversize = len(raw) > MAX_FIELD_CHARS
    chars: list[str] = []
    index_map: list[int] = []
    zw = hg = 0
    for i, ch in enumerate(raw[:MAX_SCAN_CHARS]):
        if ch in ZERO_WIDTH:
            zw += 1
            continue
        if ch in BIDI_MARKS or ch == "\u0640":
            continue
        if ch in HOMOGLYPHS or ch.lower() in HOMOGLYPHS:
            out = HOMOGLYPHS.get(ch) or HOMOGLYPHS[ch.lower()]
            hg += 1
        else:
            decomposed = unicodedata.normalize("NFKD", ch)
            out = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
        for o in out.translate(AR_FOLD):
            chars.append(o)
            index_map.append(i)
    text = "".join(chars)
    has_latin = any("a" <= c <= "z" for c in text)
    return Normalised(raw=raw, text=text, index_map=index_map, zero_width=zw, homoglyphs=hg, oversize=oversize,
                      has_latin=has_latin)
