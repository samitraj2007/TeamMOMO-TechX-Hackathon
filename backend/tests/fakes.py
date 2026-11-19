"""Offline stand-ins for the investigator model. Tests never hit the network."""

import json
from typing import Callable

from backend.app.agents.cache import JsonCache
from backend.app.agents.investigator import Completion, Investigator, TokenUsage
from backend.app.config import Settings

USAGE = TokenUsage(prompt_tokens=300, completion_tokens=80, reasoning_tokens=30, total_tokens=380)


def respond(recommendation: str = "CLEAR", confidence: float = 0.9, cite: list[str] | None = None) -> Callable:
    """Responder that cites the first evidence record unless `cite` overrides it."""

    def responder(payload: dict) -> str:
        ids = cite if cite is not None else [payload["evidence"][0]["id"]]
        return json.dumps({"findings": [{"code": "PROFILE_CONSISTENT", "record_ids": ids, "note": "test"}],
                           "recommendation": recommendation, "confidence": confidence})

    return responder


class ScriptedBackend:
    """Records every prompt; `responder` maps the parsed user payload to the raw model content or raises."""

    def __init__(self, responder: Callable[[dict], str] = respond()):
        self.responder = responder
        self.prompts: list[tuple[str, str]] = []

    def complete(self, system: str, user: str) -> Completion:
        self.prompts.append((system, user))
        return Completion(self.responder(json.loads(user)), USAGE)


class ExplodingBackend:
    """Fails the test if called: proves replay mode and cache hits stay offline."""

    def complete(self, system: str, user: str) -> Completion:
        raise AssertionError("network call attempted")


def make_investigator(cache, backend=None, mode: str = "live", model: str = "main-test") -> Investigator:
    """`cache` is a path or a shared JsonCache (share it when another agent writes to the same file)."""
    s = Settings(_env_file=None, demo_mode=mode, groq_model_main=model)
    return Investigator(s, cache if isinstance(cache, JsonCache) else JsonCache(cache),
                        ScriptedBackend() if backend is None else backend)
