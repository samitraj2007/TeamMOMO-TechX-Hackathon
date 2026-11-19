"""Citation verifier (CODE). Every report sentence must cite at least one record ID that exists in the evidence.

Model-written text is split into sentences and each sentence is checked on its own; a sentence without a valid
citation is rejected. Model text that names a subject is also rejected: identities come from the database via code.
"""

import re
from typing import Literal

from pydantic import BaseModel

RECORD_ID = r"[A-Z]{2,4}-\d{3,6}"
CITATION = re.compile(rf"\[({RECORD_ID}(?:\s*,\s*{RECORD_ID})*)\]")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=\S)")

RejectReason = Literal["UNCITED", "UNKNOWN_RECORD", "IDENTITY_IN_NARRATIVE", "EMPTY"]


class SentenceCheck(BaseModel):
    section: str
    source: Literal["CODE", "LLM"]
    text: str
    record_ids: list[str]
    accepted: bool
    reason: RejectReason | None = None


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_END.split(" ".join(text.split())) if s.strip()]


def cited_ids(sentence: str) -> list[str]:
    return [i.strip() for m in CITATION.finditer(sentence) for i in m.group(1).split(",")]


def _contains_identity(sentence: str, identities: list[str]) -> bool:
    low = sentence.casefold()
    return any(len(name) >= 4 and name.casefold() in low for name in identities)


def verify_text(text: str, known_ids: set[str], section: str, identities: list[str] = (),
                source: Literal["CODE", "LLM"] = "LLM") -> list[SentenceCheck]:
    """Check free-form narrative sentence by sentence."""
    checks = []
    for sentence in split_sentences(text) or [""]:
        ids = cited_ids(sentence)
        if not CITATION.sub("", sentence).strip(" .;,"):
            reason = "EMPTY"
        elif not ids:
            reason = "UNCITED"
        elif any(i not in known_ids for i in ids):
            reason = "UNKNOWN_RECORD"
        elif _contains_identity(sentence, identities):
            reason = "IDENTITY_IN_NARRATIVE"
        else:
            reason = None
        checks.append(SentenceCheck(section=section, source=source, text=sentence, record_ids=ids,
                                    accepted=reason is None, reason=reason))
    return checks


def verify_code_sentence(text: str, record_ids: list[str], known_ids: set[str], section: str) -> SentenceCheck:
    """Code-built sentences carry their citations structurally; values from the DB are not re-parsed."""
    if not record_ids:
        reason = "UNCITED"
    elif any(i not in known_ids for i in record_ids):
        reason = "UNKNOWN_RECORD"
    else:
        reason = None
    return SentenceCheck(section=section, source="CODE", text=text, record_ids=record_ids, accepted=reason is None,
                         reason=reason)
