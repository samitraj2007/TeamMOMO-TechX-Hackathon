"""JSON-file cache for every model call. Committed to git so DEMO_MODE=replay works from a clean clone."""

import hashlib
import json
import os
import threading
from pathlib import Path


def cache_key(model: str, prompt_version: str, payload: str) -> str:
    return hashlib.sha256(f"{model}\x1f{prompt_version}\x1f{payload}".encode()).hexdigest()


class JsonCache:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._data: dict[str, dict] = json.loads(path.read_text("utf-8")) if path.exists() else {}

    def get(self, key: str) -> dict | None:
        return self._data.get(key)

    def put(self, key: str, value: dict) -> None:
        with self._lock:
            self._data[key] = value
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=1, sort_keys=True), "utf-8")
            os.replace(tmp, self.path)

    def __len__(self) -> int:
        return len(self._data)
