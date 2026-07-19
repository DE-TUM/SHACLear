"""OpenRouter LLM client with per-model pricing.

Reads the API key from the OPENROUTER_API_KEY environment variable.
If no key is set, returns a stub response so the rest of the app stays usable.
"""
from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from typing import TypedDict

import httpx

from core.prompts import SYSTEM_PROMPT

OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"

# The models offered in the interface's model picker, grouped by vendor.
#
# No `:free` variants: the free tier is rate-capped (and deprioritised, so
# calls queue), which is exactly the failure a live demo cannot absorb. Where
# a model exists in both forms we point at the paid twin — for Llama 3.3 70B
# that costs ~$0.0004 per generation.
#
# The size-comparison tiers (Llama 1B/8B/70B, Qwen 7B/32B/72B) were fixtures
# of the scaling experiment and are not offered here; the evaluation pins its
# own model ids.
MODEL_IDS: dict[str, str] = {
    # ── OpenAI ───────────────────────────────────────────────────────
    "GPT-4o mini":           "openai/gpt-4o-mini",
    "GPT-OSS 120B":          "openai/gpt-oss-120b",
    "GPT-5 mini":            "openai/gpt-5-mini",
    "GPT-5":                 "openai/gpt-5",

    # ── Anthropic ────────────────────────────────────────────────────
    "Claude Haiku 4.5":      "anthropic/claude-haiku-4.5",
    "Claude 4.5 Sonnet":     "anthropic/claude-sonnet-4.5",

    # ── Google ───────────────────────────────────────────────────────
    "Gemma 3 12B":           "google/gemma-3-12b-it",
    "Gemma 3 27B":           "google/gemma-3-27b-it",
    "Gemini 3.1 Flash Lite": "google/gemini-3.1-flash-lite",

    # ── Meta ─────────────────────────────────────────────────────────
    "Llama 3.3 70B":         "meta-llama/llama-3.3-70b-instruct",
    "Llama 4 Scout":         "meta-llama/llama-4-scout",
    "Llama 4 Maverick":      "meta-llama/llama-4-maverick",

    # ── DeepSeek ─────────────────────────────────────────────────────
    "DeepSeek V3.2":         "deepseek/deepseek-v3.2",
    "DeepSeek V4 Flash":     "deepseek/deepseek-v4-flash",

    # ── Qwen ─────────────────────────────────────────────────────────
    "Qwen3 Next 80B":        "qwen/qwen3-next-80b-a3b-instruct",
    "Qwen3 30B A3B":         "qwen/qwen3-30b-a3b-instruct-2507",

    # ── Mistral ──────────────────────────────────────────────────────
    "Mistral Nemo":          "mistralai/mistral-nemo",
    "Mistral Small 3.2 24B": "mistralai/mistral-small-3.2-24b-instruct",
    "Mistral Medium 3.1":    "mistralai/mistral-medium-3.1",

    # ── xAI ──────────────────────────────────────────────────────────
    "Grok 4.5":              "x-ai/grok-4.5",
}

# Cost per 1M tokens (USD), as (input_price, output_price).
#
# Hand-maintained and therefore prone to drift from OpenRouter's live rates —
# these were last reconciled against the /api/v1/models catalogue on
# 2026-07-15. They drive the cost readout and the picker's tier badge, so a
# stale entry shows the user a wrong number rather than breaking a call.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "GPT-4o mini":           (0.15, 0.60),
    "GPT-OSS 120B":          (0.037, 0.17),
    "GPT-5 mini":            (0.25, 2.00),
    "GPT-5":                 (1.25, 10.00),

    "Claude Haiku 4.5":      (1.00, 5.00),
    "Claude 4.5 Sonnet":     (3.00, 15.00),

    "Gemma 3 12B":           (0.05, 0.15),
    "Gemma 3 27B":           (0.08, 0.45),
    "Gemini 3.1 Flash Lite": (0.25, 1.50),

    "Llama 3.3 70B":         (0.13, 0.40),
    "Llama 4 Scout":         (0.10, 0.30),
    "Llama 4 Maverick":      (0.20, 0.80),

    "DeepSeek V3.2":         (0.269, 0.40),
    "DeepSeek V4 Flash":     (0.098, 0.196),

    "Qwen3 Next 80B":        (0.10, 1.10),
    "Qwen3 30B A3B":         (0.10, 0.30),

    "Mistral Nemo":          (0.02, 0.04),
    "Mistral Small 3.2 24B": (0.10, 0.30),
    "Mistral Medium 3.1":    (0.40, 2.00),

    "Grok 4.5":              (2.00, 6.00),
}

LANG_INSTRUCTIONS: dict[str, str] = {
    "en": "Respond in English.",
    "de": "Antworte auf Deutsch.",
    "zh": "用简体中文回答。",
    "fr": "Répondez en français.",
    "es": "Responde en español.",
    "ja": "日本語で答えてください。",
    "pt": "Responda em português.",
    "ar": "أجب باللغة العربية.",
}


class LLMResult(TypedDict):
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    cost: float
    elapsed_s: float


def calculate_cost(model_key: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Return estimated cost in USD for a single call."""
    input_price, output_price = MODEL_PRICES.get(model_key, (0.0, 0.0))
    return (prompt_tokens * input_price + completion_tokens * output_price) / 1_000_000


def _get_api_key() -> str | None:
    return os.environ.get("OPENROUTER_API_KEY")


def _request_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Simon-Jost/shacl-nl-interface",
        "X-Title": "SHACL to Natural Language",
    }


def _raise_for_status(model_key: str, status: int) -> None:
    """Map an OpenRouter HTTP status to a user-facing RuntimeError (no-op on 2xx)."""
    if status == 401:
        raise RuntimeError("Invalid API key. Check the OPENROUTER_API_KEY env variable.")
    if status == 402:
        raise RuntimeError("Insufficient credits. Top up your OpenRouter account.")
    if status == 404:
        raise RuntimeError(f"Model '{model_key}' not found. It may have been renamed or removed.")
    if status == 429:
        raise RuntimeError("Rate limit exceeded. Please wait a moment before trying again.")
    if status == 503:
        raise RuntimeError(f"Model '{model_key}' is currently unavailable. Try a different model.")
    if status >= 500:
        raise RuntimeError(f"OpenRouter server error ({status}). Please try again later.")


def _stub_llm(prompt: str, model_key: str) -> LLMResult:  # noqa: ARG001
    """Fallback when no API key is set — returns a placeholder response."""
    time.sleep(0.5)
    return {
        "text": (
            "*(Stub output — no API key set)*\n\n"
            "This is a placeholder explanation for the SHACL shape. "
            "Set the OPENROUTER_API_KEY env variable (or `backend/.env`) to get real results."
        ),
        "model": MODEL_IDS.get(model_key, model_key),
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "cost": 0.0,
        "elapsed_s": 0.5,
    }


def call_llm(
    prompt: str,
    model_key: str,
    temperature: float = 0.3,
    lang: str = "en",
    max_tokens: int = 500,
    system: str | None = None,
) -> LLMResult:
    """Call OpenRouter and return the explanation, tokens, cost, and elapsed time.

    The system instruction defaults to the canonical ``SYSTEM_PROMPT``; pass
    ``system`` to override it for a specific call (e.g. a reflection pass).
    """
    if model_key not in MODEL_IDS:
        # A stale/renamed key (e.g. from a persisted client selection) would
        # otherwise blow up with a KeyError → 500. Surface it as a clean 400.
        raise ValueError(
            f"Unknown model '{model_key}'. It may have been renamed or removed — "
            "pick a model from /api/models."
        )

    api_key = _get_api_key()
    if not api_key:
        return _stub_llm(prompt, model_key)

    lang_prefix = LANG_INSTRUCTIONS.get(lang, "")
    full_prompt = f"{lang_prefix}\n\n{prompt}" if lang_prefix else prompt

    t_start = time.time()
    last_error: str | None = None
    response: httpx.Response | None = None
    for attempt in range(2):  # retry on timeout
        try:
            response = httpx.post(
                OPENROUTER_BASE,
                headers=_request_headers(api_key),
                json={
                    "model": MODEL_IDS[model_key],
                    "messages": [
                        {"role": "system", "content": system or SYSTEM_PROMPT},
                        {"role": "user", "content": full_prompt},
                    ],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
                timeout=60.0,
            )
            break
        except httpx.TimeoutException:
            last_error = f"Model timed out after 60s (attempt {attempt + 1})"
            time.sleep(2)
    else:
        raise RuntimeError(last_error or "Request timed out")

    assert response is not None
    elapsed = round(time.time() - t_start, 2)

    # ── HTTP-level errors ─────────────────────────────────────────────────────
    _raise_for_status(model_key, response.status_code)

    # ── JSON-level errors ─────────────────────────────────────────────────────
    try:
        data = response.json()
    except Exception as e:
        raise RuntimeError("Received an invalid response from OpenRouter. Please try again.") from e

    if "error" in data:
        err = data["error"]
        msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        if "context" in msg.lower() or "token" in msg.lower():
            raise RuntimeError(
                f"Prompt too long for this model. Try a shorter SHACL shape or switch to Mode A. ({msg})"
            )
        raise RuntimeError(f"OpenRouter error: {msg}")

    # ── Missing fields ────────────────────────────────────────────────────────
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise RuntimeError("Unexpected response format from OpenRouter — 'choices' missing.") from e

    try:
        prompt_tokens = data["usage"]["prompt_tokens"]
        completion_tokens = data["usage"]["completion_tokens"]
    except KeyError:
        prompt_tokens = 0
        completion_tokens = 0

    return {
        "text": text,
        "model": MODEL_IDS[model_key],
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost": calculate_cost(model_key, prompt_tokens, completion_tokens),
        "elapsed_s": elapsed,
    }


# ──────────────────────────── Streaming ───────────────────────────────────────
# A streaming call yields a sequence of dict events:
#   {"type": "delta", "text": "..."}                    — incremental content
#   {"type": "meta",  "prompt_tokens", "completion_tokens", "cost", "elapsed_s"}
# The single "meta" event is always emitted last, even on an empty response.

StreamEvent = dict[str, object]


def _stub_stream(model_key: str) -> Iterator[StreamEvent]:
    """Fallback streaming generator when no API key is set."""
    text = (
        "*(Stub output — no API key set)* "
        "This is a placeholder explanation for the SHACL shape. "
        "Set the OPENROUTER_API_KEY env variable (or `backend/.env`) to get real results."
    )
    t_start = time.time()
    for word in text.split(" "):
        yield {"type": "delta", "text": word + " "}
        time.sleep(0.03)
    yield {
        "type": "meta",
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "cost": 0.0,
        "elapsed_s": round(time.time() - t_start, 2),
    }


def stream_llm(
    prompt: str,
    model_key: str,
    temperature: float = 0.3,
    lang: str = "en",
    max_tokens: int = 500,
    system: str | None = None,
) -> Iterator[StreamEvent]:
    """Stream an OpenRouter completion, yielding ``delta`` events then one ``meta``.

    Token usage is requested inline (``usage.include``) so the final SSE chunk
    carries prompt/completion counts; cost is derived from those. Mirrors
    :func:`call_llm` for prompt assembly and HTTP-error mapping.
    """
    api_key = _get_api_key()
    if not api_key:
        yield from _stub_stream(model_key)
        return

    lang_prefix = LANG_INSTRUCTIONS.get(lang, "")
    full_prompt = f"{lang_prefix}\n\n{prompt}" if lang_prefix else prompt

    t_start = time.time()
    prompt_tokens = 0
    completion_tokens = 0

    payload = {
        "model": MODEL_IDS[model_key],
        "messages": [
            {"role": "system", "content": system or SYSTEM_PROMPT},
            {"role": "user", "content": full_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
        "usage": {"include": True},
    }

    with httpx.stream(
        "POST",
        OPENROUTER_BASE,
        headers=_request_headers(api_key),
        json=payload,
        timeout=httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0),
    ) as response:
        if response.status_code != 200:
            response.read()  # drain so the connection can be reused
            _raise_for_status(model_key, response.status_code)
            raise RuntimeError(f"OpenRouter error ({response.status_code}).")

        for line in response.iter_lines():
            if not line or line.startswith(":"):  # blank line / SSE keep-alive comment
                continue
            if not line.startswith("data: "):
                continue
            data_str = line[len("data: "):].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            if "error" in chunk:
                err = chunk["error"]
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                raise RuntimeError(f"OpenRouter error: {msg}")

            usage = chunk.get("usage")
            if usage:
                prompt_tokens = usage.get("prompt_tokens", prompt_tokens)
                completion_tokens = usage.get("completion_tokens", completion_tokens)

            choices = chunk.get("choices") or []
            if choices:
                content = (choices[0].get("delta") or {}).get("content")
                if content:
                    yield {"type": "delta", "text": content}

    yield {
        "type": "meta",
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost": calculate_cost(model_key, prompt_tokens, completion_tokens),
        "elapsed_s": round(time.time() - t_start, 2),
    }
