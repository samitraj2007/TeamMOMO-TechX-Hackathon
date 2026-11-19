from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    app_env: Literal["dev", "prod"] = "dev"
    demo_mode: Literal["live", "replay"] = "live"
    aed_block_threshold: float = 10_000.0
    qa_sample_rate: float = 0.10

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model_main: str = ""
    groq_model_light: str = ""
    groq_model_guard: str = ""
    guard_threshold: float = 0.5
    guard_max_segments: int = 12
    llm_timeout_s: float = 10.0

    backup_llm_name: str = "backup"
    backup_llm_base_url: str = ""
    backup_llm_api_key: str = ""
    backup_llm_model: str = ""
    backup_llm_reasoning_effort: str = ""

    db_path: str = "backend/data/gulf_horizon_mini.sqlite"
    cache_path: str = "backend/data/llm_cache.json"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    def resolve(self, p: str) -> Path:
        path = Path(p)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def db_file(self) -> Path:
        return self.resolve(self.db_path)

    @property
    def cache_file(self) -> Path:
        return self.resolve(self.cache_path)


@lru_cache
def get_settings() -> Settings:
    return Settings()
