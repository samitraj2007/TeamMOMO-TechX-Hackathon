"""Layer 1b: deterministic injection detection (EN + AR) with spans on the raw text."""

import base64
import binascii
import re
from dataclasses import dataclass

from backend.app.security.normalise import Normalised, normalise

# Patterns run on normalised text: lowercase, marks stripped, Arabic alef/hamza/ta-marbuta folded.
PATTERNS: list[tuple[str, re.Pattern]] = [(code, re.compile(p)) for code, p in [
    ("OVERRIDE_INSTRUCTION",
     r"\b(ignore|disregard|forget|bypass|override)\b[^.\n]{0,40}?\b(previous|prior|above|all|earlier|system|any)\b"
     r"[^.\n]{0,20}?\b(instructions?|rules?|prompts?|directives?|policies|guidelines)\b"),
    ("FAKE_SYSTEM_TAG", r"[\[(<{]\s*(system|admin|developer|assistant|root|sys)\b[^\])>}]{0,120}[\])>}]?"),
    ("FAKE_SYSTEM_TAG", r"\b(system|admin|developer)\s+(override|mode|prompt|message|instruction)\b"),
    ("PROMPT_DELIMITER", r"<\|?(im_start|im_end|system|endoftext)\|?>|^\s*#{2,}\s*(system|instruction)|```"),
    ("ROLE_ADDRESS", r"\b(assistant|ai|chatbot|llm|gpt|model|investigator)\s*:"),
    ("DECISION_COERCION",
     r"\b(mark|classify|flag|label|treat|set|report)\b[^.\n]{0,30}?\b(safe|legitimate|cleared?|approved|low[- ]risk|"
     r"not\s+fraud|benign)\b"),
    ("DECISION_COERCION",
     r"\b(release|approve|clear|authori[sz]e|unblock)\s+(the\s+|this\s+|all\s+)?(funds|transfer|transaction|payment)\b"),
    ("REVIEW_BYPASS",
     r"\b(no|without|skip|bypass|avoid)\s+(further\s+|any\s+|manual\s+)?(review|checks?|verification|screening|"
     r"approval|escalation)\b"),
    ("SOCIAL_ENGINEERING",
     r"\b(compliance|management|ceo|cfo|security\s+team)\b[^.\n]{0,25}?\b(pre-?approved|has\s+approved|authori[sz]ed|"
     r"cleared)\b"),
    ("OVERRIDE_INSTRUCTION", r"(تجاهل|تخط|تخطى|انس|اهمل|الغ)[^.\n]{0,40}?(التعليمات|الاوامر|القواعد|التوجيهات)"),
    ("DECISION_COERCION", r"(وافق|اعتمد|حرر|افرج|مرر)[^.\n]{0,30}?(التحويل|تحويل|الاموال|الدفعه|المعامله)"),
    ("DECISION_COERCION", r"(صنف|اعتبر)[^.\n]{0,30}?(امنه|امنا|سليمه|سليما|قانونيه)"),
    ("FAKE_SYSTEM_TAG", r"[\[(<{]\s*(النظام|نظام|المسوول|المشرف)"),
    ("REVIEW_BYPASS", r"(بدون|دون|بلا)\s+(مراجعه|تدقيق|تحقق|موافقه)"),
]]

_B64 = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")
_HEX = re.compile(r"\b(?:[0-9a-fA-F]{2}){10,}\b")


@dataclass(frozen=True)
class RegexHit:
    field: str
    code: str
    start: int
    end: int


def _printable_text(data: bytes) -> str | None:
    try:
        s = data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if len(s) < 8 or sum(c.isprintable() for c in s) / len(s) < 0.95 or sum(c.isalpha() for c in s) / len(s) < 0.5:
        return None
    return s


def decode_payloads(raw: str) -> list[tuple[int, int, str]]:
    found = []
    for m in _B64.finditer(raw):
        token = m.group()
        try:
            data = base64.b64decode(token + "=" * (-len(token) % 4), validate=True)
        except (binascii.Error, ValueError):
            continue
        if (text := _printable_text(data)) is not None:
            found.append((m.start(), m.end(), text))
    for m in _HEX.finditer(raw):
        if (text := _printable_text(bytes.fromhex(m.group()))) is not None:
            found.append((m.start(), m.end(), text))
    return found


def scan_normalised(n: Normalised, field: str) -> list[RegexHit]:
    hits = []
    for code, pattern in PATTERNS:
        for m in pattern.finditer(n.text):
            start, end = n.raw_span(m.start(), m.end())
            hits.append(RegexHit(field, code, start, end))
    return hits


def scan_field(raw: str, field: str) -> tuple[list[RegexHit], Normalised, list[str]]:
    """Returns hits (spans on raw text), the normalised view, and decoded payload texts."""
    n = normalise(raw)
    hits = scan_normalised(n, field)
    decoded_texts = []
    for start, end, text in decode_payloads(raw):
        decoded_texts.append(text)
        if scan_normalised(normalise(text), field):
            hits.append(RegexHit(field, "ENCODED_INSTRUCTION", start, end))
    if n.zero_width:
        hits.append(RegexHit(field, "OBFUSCATION_ZERO_WIDTH", 0, 0))
    if n.homoglyphs and n.has_latin:
        hits.append(RegexHit(field, "OBFUSCATION_HOMOGLYPH", 0, 0))
    if n.oversize:
        hits.append(RegexHit(field, "OVERSIZE_FIELD", 0, 0))
    hits.sort(key=lambda h: (h.start, h.end))
    return hits, n, decoded_texts
