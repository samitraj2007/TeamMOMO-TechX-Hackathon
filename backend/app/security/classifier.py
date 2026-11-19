"""Layer 2: Prompt Guard 2 classifier (model name from GROQ_MODEL_GUARD), cached, fail-closed."""

import re
import time
from datetime import datetime, timezone
from typing import Callable, Literal, Protocol

from pydantic import BaseModel

from backend.app.agents.cache import JsonCache, cache_key
from backend.app.config import Settings

PROMPT_VERSION = "guard-v1"
# Prompt Guard 2 reads 512 tokens. 800 characters stays under that even for Arabic (~2 chars/token); the overlap
# guarantees any phrase up to SEGMENT_OVERLAP characters long lands whole in at least one segment.
SEGMENT_CHARS = 800
SEGMENT_OVERLAP = 200


def segment(text: str, size: int = SEGMENT_CHARS, overlap: int = SEGMENT_OVERLAP) -> list[str]:
    if len(text) <= size:
        return [text]
    stride = size - overlap
    out = []
    for start in range(0, len(text), stride):
        out.append(text[start:start + size])
        if start + size >= len(text):
            break
    return out


class GuardVerdict(BaseModel):
    field: str
    status: Literal["ok", "unavailable", "cache_miss", "segment_cap"]
    score: float | None
    flagged: bool | None
    model: str
    cached: bool
    segments_total: int = 1
    segments_scanned: int = 1


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
    """`min_interval_s` paces calls and `rate_limit_retries` backs off on 429; both off on the live request path
    so a rate-limited demo fails closed fast instead of stalling."""

    def __init__(self, settings: Settings, min_interval_s: float = 0.0, rate_limit_retries: int = 0,
                 sleep: Callable[[float], None] = time.sleep):
        from openai import OpenAI

        self.model = settings.groq_model_guard
        self.client = OpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url,
                             timeout=settings.llm_timeout_s, max_retries=0 if rate_limit_retries else 1)
        self.min_interval_s = min_interval_s
        self.rate_limit_retries = rate_limit_retries
        self.sleep = sleep
        self.rate_limited = 0
        self._last_call = 0.0

    def _create(self, text: str):
        wait = self.min_interval_s - (time.monotonic() - self._last_call)
        if wait > 0:
            self.sleep(wait)
        self._last_call = time.monotonic()
        return self.client.chat.completions.create(model=self.model, messages=[{"role": "user", "content": text}])

    def score(self, text: str) -> float:
        from openai import RateLimitError

        for attempt in range(self.rate_limit_retries + 1):
            try:
                r = self._create(text)
                break
            except RateLimitError as e:
                self.rate_limited += 1
                if attempt == self.rate_limit_retries:
                    raise
                self.sleep(backoff_seconds(attempt, e.response.headers.get("retry-after")))
        return parse_score(r.choices[0].message.content)


def backoff_seconds(attempt: int, retry_after: str | None, cap: float = 60.0) -> float:
    try:
        hinted = float(retry_after) if retry_after else 0.0
    except ValueError:
        hinted = 0.0
    return min(cap, max(hinted, 2.0 * 2 ** attempt))


class Guard:
    def __init__(self, settings: Settings, cache: JsonCache, backend: GuardBackend | None):
        self.settings = settings
        self.cache = cache
        self.backend = backend
        self.model = settings.groq_model_guard or "unset"

    def _score_one(self, text: str) -> tuple[Literal["ok", "unavailable", "cache_miss"], float | None, bool]:
        key = cache_key(self.model, PROMPT_VERSION, text)
        if (hit := self.cache.get(key)) is not None:
            return "ok", hit["score"], True
        if self.settings.demo_mode == "replay":
            return "cache_miss", None, False
        if self.backend is None or not self.settings.groq_model_guard:
            return "unavailable", None, False
        try:
            score = self.backend.score(text)
        except Exception:
            return "unavailable", None, False
        self.cache.put(key, {"score": score, "model": self.model, "prompt_version": PROMPT_VERSION,
                             "ts": datetime.now(timezone.utc).isoformat()})
        return "ok", score, False

    def classify(self, field: str, text: str, max_segments: int | None = None) -> GuardVerdict:
        """Max score over overlapping segments. Stops at the first flagged segment. Segments beyond `max_segments`
        are not scanned and, unless something was already flagged, the verdict is `segment_cap` (fail closed)."""
        threshold = self.settings.guard_threshold
        segments = segment(text)
        budget = len(segments) if max_segments is None else max(0, min(max_segments, len(segments)))
        scores: list[float] = []
        statuses: list[str] = []
        cached = True
        for seg in segments[:budget]:
            status, score, hit = self._score_one(seg)
            statuses.append(status)
            cached = cached and hit
            if status != "ok":
                break
            if score is not None:
                scores.append(score)
                if score >= threshold:
                    break
        best = max(scores) if scores else None
        flagged = best is not None and best >= threshold
        failed = next((s for s in statuses if s != "ok"), None)
        if flagged:
            status = "ok"
        elif failed:
            status = failed
        elif budget < len(segments):
            status = "segment_cap"
        else:
            status = "ok"
        return GuardVerdict(field=field, status=status, score=best if status == "ok" or flagged else None,
                            flagged=flagged if status == "ok" else None, model=self.model,
                            cached=cached and bool(statuses), segments_total=len(segments),
                            segments_scanned=len(statuses))


def build_guard(settings: Settings, cache: JsonCache | None = None, **backend_opts) -> Guard:
    """Pass the same `cache` to every agent: separate JsonCache instances on one file overwrite each other."""
    backend = GroqGuardBackend(settings, **backend_opts) if settings.groq_api_key and settings.groq_model_guard else None
    return Guard(settings, cache or JsonCache(settings.cache_file), backend)
