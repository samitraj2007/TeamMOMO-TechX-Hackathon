import logging

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.security.classifier import Guard
from backend.tests.fakes import make_investigator

TOKEN = "test-admin-token"


class LowScore:
    def score(self, text):
        return 0.01


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    def build(mode="live", token=TOKEN):
        s = Settings(_env_file=None, db_path=str(tmp_path / "api.sqlite"), cache_path=str(tmp_path / "c.json"),
                     groq_model_guard="guard-test", demo_mode=mode, demo_admin_token=token)
        monkeypatch.setattr(main, "settings", s)
        monkeypatch.setattr(main, "_guard", Guard(s, JsonCache(s.cache_file), LowScore()))
        monkeypatch.setattr(main, "_investigator", make_investigator(tmp_path / "inv.json"))
        monkeypatch.setattr(main, "_runs", {})
        get_settings.cache_clear()
        monkeypatch.setattr("backend.app.db.get_settings", lambda: s)
        c = TestClient(main.app)
        a = next(x["alert_id"] for x in c.get("/cases").json() if x["demo_tag"] == "A")
        c.post(f"/cases/{a}/run")
        return c, a
    return build


def reset(c, token=None):
    return c.post("/demo/reset", headers={"X-Admin-Token": token} if token is not None else {})


@pytest.mark.parametrize("token", [None, "", "wrong-token", TOKEN + "x", TOKEN.upper()])
def test_reset_refused_without_matching_token_and_nothing_wiped(make_client, token):
    c, a = make_client()
    before = c.get("/audit/verify").json()
    assert reset(c, token).status_code == 403
    assert c.get("/audit/verify").json() == before and before["entries"] > 0
    assert c.get(f"/cases/{a}").json()["resolution"] is not None


def test_reset_disabled_when_no_token_configured(make_client):
    c, _ = make_client(token="")
    assert reset(c, "").status_code == 403 and reset(c, "anything").status_code == 403


def test_reset_hidden_when_demo_mode_off(make_client):
    c, _ = make_client(mode="off")
    assert reset(c, TOKEN).status_code == 404


@pytest.mark.parametrize("mode", ["live", "replay"])
def test_reset_returns_and_logs_audit_head_before_wiping(make_client, caplog, mode):
    c, a = make_client(mode=mode)
    head = c.get("/audit/verify").json()
    with caplog.at_level(logging.WARNING, logger="momo.audit"):
        r = reset(c, TOKEN)
    assert r.status_code == 200
    prev = r.json()["previous_audit_head"]
    assert prev["head_hash"] == head["head_hash"] and prev["entries"] == head["entries"] and prev["ok"]
    assert head["head_hash"] in caplog.text and head["head_record_id"] in caplog.text
    after = c.get("/audit/verify").json()
    assert after["entries"] == 0 and after["ok"]
    assert c.get(f"/cases/{a}").json()["resolution"] is None
