"""Integration tests for the FastAPI backend.

Uses TestClient (no real server) and patches the LLM call so no real
network requests are made.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from backend.main import app
import core.llm_client as llm_mod

client = TestClient(app)


@pytest.fixture(autouse=True)
def stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the LLM client into stub mode for every test in this module."""
    monkeypatch.setattr(llm_mod, "_get_api_key", lambda: None)


def test_health() -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_list_models() -> None:
    res = client.get("/api/models")
    assert res.status_code == 200
    data = res.json()
    assert "models" in data
    assert any(m["key"] == "Llama 3.3 70B" for m in data["models"])


def test_validate_ok() -> None:
    shape = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
        "@prefix ex: <http://example.org/> .\n"
        "ex:S a sh:NodeShape ; sh:targetClass ex:T ."
    )
    res = client.post("/api/validate", json={"turtle": shape})
    assert res.status_code == 200
    assert res.json()["valid"] is True


def test_validate_rejects_garbage() -> None:
    res = client.post("/api/validate", json={"turtle": "garbage"})
    assert res.json()["valid"] is False
    assert "error" in res.json()


@pytest.mark.parametrize("mode", ["a", "b", "c"])
def test_generate_returns_stub(mode: str) -> None:
    shape = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
        "@prefix ex: <http://example.org/> .\n"
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n"
        "ex:S a sh:NodeShape ; sh:targetClass ex:T ;\n"
        "  sh:property [ sh:path ex:name ; sh:datatype xsd:string ] ."
    )
    res = client.post(
        "/api/generate",
        json={"turtle": shape, "model": "Llama 3.3 70B", "mode": mode, "reflection": False},
    )
    assert res.status_code == 200
    body = res.json()
    assert "Stub output" in body["explanation"]

def test_generate_unknown_model_returns_400() -> None:
    """A stale/renamed model key (e.g. from a persisted client selection) should
    yield a clean 400, not a 500 KeyError."""
    shape = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
        "@prefix ex: <http://example.org/> .\n"
        "ex:S a sh:NodeShape ; sh:targetClass ex:T ."
    )
    res = client.post(
        "/api/generate",
        json={"turtle": shape, "model": "Qwen3 80B", "mode": "c", "reflection": False},
    )
    assert res.status_code == 400
    assert "Unknown model" in res.json()["detail"]


# ──────────────────────────── Streaming endpoint ──────────────────────────────
_STREAM_SHAPE = (
    "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
    "@prefix ex: <http://example.org/> .\n"
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n"
    "ex:S a sh:NodeShape ; sh:targetClass ex:T ;\n"
    "  sh:property [ sh:path ex:name ; sh:datatype xsd:string ] ."
)


def _collect_stream(turtle: str, mode: str, reflection: bool = False) -> list[dict]:
    body = {"turtle": turtle, "model": "Llama 3.3 70B", "mode": mode, "reflection": reflection}
    with client.stream("POST", "/api/generate/stream", json=body) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/x-ndjson")
        return [json.loads(line) for line in res.iter_lines() if line.strip()]


@pytest.mark.parametrize("mode", ["a", "b", "c"])
def test_stream_emits_preprocessed_deltas_and_done(mode: str) -> None:
    events = _collect_stream(_STREAM_SHAPE, mode)
    types = [e["type"] for e in events]

    assert types[0] == "preprocessed"
    assert types[-1] == "done"
    assert "delta" in types

    text = "".join(e["text"] for e in events if e["type"] == "delta")
    assert "Stub output" in text

    done = events[-1]
    assert done["mode"] == mode
    assert {"tokens", "cost", "elapsed_s", "model", "preprocessed"} <= done.keys()


def test_stream_reflection_resets_text() -> None:
    events = _collect_stream(_STREAM_SHAPE, "a", reflection=True)
    types = [e["type"] for e in events]
    assert "reflect_start" in types
    assert types.index("reflect_start") < types.index("done")


def test_stream_invalid_turtle_yields_error_event() -> None:
    events = _collect_stream("garbage", "a")
    # A 200 stream has already begun, so the failure arrives as an error event.
    assert events[-1]["type"] == "error"
    assert events[-1]["status"] == 400