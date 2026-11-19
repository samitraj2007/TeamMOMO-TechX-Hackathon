import pytest

from backend.app.db import connect
from backend.data.generate import generate


@pytest.fixture
def conn(tmp_path):
    path = tmp_path / "test.sqlite"
    generate(path)
    c = connect(path)
    yield c
    c.close()


@pytest.fixture
def demo(conn):
    rows = conn.execute("SELECT * FROM transactions WHERE demo_tag IS NOT NULL").fetchall()
    return {r["demo_tag"]: dict(r) for r in rows}
