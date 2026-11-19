"""Layer 2: Prompt Guard 2 classifier (model name from GROQ_MODEL_GUARD), cached, fail-closed."""

import re
from datetime import datetime, timezone
from typing import Literal, Protocol

from pydantic import BaseModel

from backend.app.agents.cache import JsonCache, cache_key
from backend.app.config import Settings

PROMPT_VERSION = "guard-v1"


class GuardVerdict(BaseModel):
    field: str
    status: Literal["ok", "unavailable", "cache_miss"]
    score: float | None
    flagged: bool | None
    model: str
    cached: bool


class GuardBackend(Protocol):
    def score(self, text: str) -> float: ...


def parse_score(content: str | None) -> float:
    """Prompt Guard on Groq answers with a probability; accept a label too, in case the format changes."""
    s = (content or "").strip().lower()
    if m := re.search(r"\d*\.?\d+(e-?\d+)?", s):
        value = float(m.group())
        if 0.0 <= value <= 1.0:
            return value
    if any(w in s for w in ("malicious", "jailbreak", "injection", "unsafe")):
        return 1.0
    if "benign" in s or "safe" in s:
        return 0.0
    raise ValueError(f"unparsable guard output: {content!r}")


class GroqGuardBackend:
    def __init__(self, settings: Settings):
        from openai import OpenAI

        self.model = settings.groq_model_guard
        self.client = OpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url,
                             timeout=settings.llm_timeout_s, max_retries=1)

    def score(self, text: str) -> float:
        r = self.client.chat.completions.create(model=self.model, messages=[{"role": "user", "content": text}])
        return parse_score(r.choices[0].message.content)


class Guard:
    def __init__(self, settings: Settings, cache: JsonCache, backend: GuardBackend | None):
        self.settings = settings
        self.cache = cache
        self.backend = backend
        self.model = settings.groq_model_guard or "unset"

    def classify(self, field: str, text: str) -> GuardVerdict:
        threshold = self.settings.guard_threshold
        key = cache_key(self.model, PROMPT_VERSION, text)
        if (hit := self.cache.get(key)) is not None:
            return GuardVerdict(field=field, status="ok", score=hit["score"], flagged=hit["score"] >= threshold,
                                model=self.model, cached=True)
        if self.settings.demo_mode == "replay":
            return GuardVerdict(field=field, status="cache_miss", score=None, flagged=None, model=self.model,
                                cached=False)
        if self.backend is None or not self.settings.groq_model_guard:
            return GuardVerdict(field=field, status="unavailable", score=None, flagged=None, model=self.model,
                                cached=False)
        try:
            score = self.backend.score(text)
        except Exception:
            return GuardVerdict(field=field, status="unavailable", score=None, flagged=None, model=self.model,
                                cached=False)
        self.cache.put(key, {"score": score, "model": self.model, "prompt_version": PROMPT_VERSION,
                             "ts": datetime.now(timezone.utc).isoformat()})
        return GuardVerdict(field=field, status="ok", score=score, flagged=score >= threshold, model=self.model,
                            cached=False)


def build_guard(settings: Settings) -> Guard:
    backend = GroqGuardBackend(settings) if settings.groq_api_key and settings.groq_model_guard else None
    return Guard(settings, JsonCache(settings.cache_file), backend)
