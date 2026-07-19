"""Smoke tests for core.prompts."""
from core.prompts import build_prompt, build_reflection_prompt, SYSTEM_PROMPT


def test_build_prompt_is_user_message_without_system() -> None:
    # build_prompt now returns ONLY the user message; the system instruction is
    # sent separately in the system role by call_llm.
    out = build_prompt("Shape: Foo", "a")
    assert SYSTEM_PROMPT not in out
    assert "Shape: Foo" in out
    assert "structured constraint table" in out


def test_call_llm_sends_system_prompt_in_system_role(monkeypatch) -> None:
    # Without an API key, call_llm returns a stub — so to inspect the payload we
    # stub httpx.post and assert the system role carries SYSTEM_PROMPT.
    import core.llm_client as llm

    captured: dict = {}

    class _FakeResponse:
        status_code = 200

        def json(self):
            return {
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            }

    def _fake_post(url, headers=None, json=None, timeout=None):  # noqa: A002
        captured["messages"] = json["messages"]
        return _FakeResponse()

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(llm.httpx, "post", _fake_post)

    llm.call_llm(build_prompt("Shape: Foo", "a"), "GPT-4o mini")

    roles = {m["role"]: m["content"] for m in captured["messages"]}
    assert roles["system"] == SYSTEM_PROMPT
    assert "Shape: Foo" in roles["user"]


def test_build_prompt_falls_back_for_unknown_mode() -> None:
    out = build_prompt("xx", "z")
    assert "xx" in out


def test_raw_turtle_is_prepended_for_modes_a_and_b() -> None:
    raw = "ex:Foo a sh:NodeShape ."
    for mode in ("a", "b"):
        out = build_prompt("Shape: Foo", mode, raw_turtle=raw)
        assert raw in out
        assert "raw Turtle" in out
        # context comes before the structured input
        assert out.index(raw) < out.index("Shape: Foo")


def test_mode_b_intro_restricts_scope_to_single_constraint() -> None:
    # Mode B receives raw Turtle as context, so the intro must explicitly
    # tell the LLM not to over-explain the rest of the shape.
    out = build_prompt("Shape 'X': property 'y' must satisfy minCount = 1", "b",
                       raw_turtle="ex:Foo a sh:NodeShape .")
    assert "ONLY" in out
    assert "MUST NOT be" in out  # negation against describing the Turtle


def test_raw_turtle_ignored_for_mode_c() -> None:
    raw = "ex:Foo a sh:NodeShape ."
    out = build_prompt("Shape: Foo", "c", raw_turtle=raw)
    assert raw not in out


def test_reflection_prompt_contains_both_parts() -> None:
    out = build_reflection_prompt("ORIGINAL", "EXPLANATION")
    assert "ORIGINAL" in out
    assert "EXPLANATION" in out
