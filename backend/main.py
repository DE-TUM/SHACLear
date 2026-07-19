"""FastAPI service exposing the SHACL → NL pipeline as REST endpoints.

This module is a thin HTTP adapter. All business logic lives in `core/`.
"""
from __future__ import annotations
from fastapi.staticfiles import StaticFiles

import json
import os
from collections.abc import Iterator
from pathlib import Path

# Load .env if available
try:
    from dotenv import load_dotenv
    ROOT = Path(__file__).resolve().parent.parent
    load_dotenv(ROOT / "backend" / ".env")
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from rdflib import Graph

from core.shacl_parser import (
    prepare_mode_a,
    prepare_mode_b,
    prepare_mode_c,
    validate_shacl_turtle,
)
from core.prompts import SYSTEM_PROMPT, build_prompt, build_reflection_prompt
from core.llm_client import call_llm, stream_llm, MODEL_IDS, MODEL_PRICES


app = FastAPI(title="SHACL → NL API", version="1.0.0")

# Allow Vite dev server and preview server by default. Override via env.
default_origins = [
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
]
extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=default_origins + extra_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────── Pydantic Models ─────────────────────
class ValidateRequest(BaseModel):
    turtle: str


class GenerateRequest(BaseModel):
    turtle: str
    model: str
    mode: str = Field(pattern="^[abc]$")
    reflection: bool = False


class RefineRequest(BaseModel):
    turtle: str
    previous_output: str
    instruction: str
    model: str


class GenerationResult(BaseModel):
    explanation: str
    preprocessed: str
    tokens: int
    cost: float
    elapsed_s: float
    model: str
    mode: str


class ModelInfo(BaseModel):
    key: str
    id: str
    input_price: float
    output_price: float


# ─────────────────────────── Routes ───────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/models")
def list_models():
    return {
        "models": [
            ModelInfo(
                key=k,
                id=v,
                input_price=MODEL_PRICES.get(k, (0.0, 0.0))[0],
                output_price=MODEL_PRICES.get(k, (0.0, 0.0))[1],
            )
            for k, v in MODEL_IDS.items()
        ]
    }


@app.post("/api/validate")
def validate(req: ValidateRequest):
    try:
        validate_shacl_turtle(req.turtle)
        return {"valid": True}
    except ValueError as e:
        return {"valid": False, "error": str(e)}


@app.post("/api/convert-rdf")
async def convert_rdf(file: UploadFile = File(...)):
    """Load (and convert if needed) an uploaded file to Turtle.

    Validation is deliberately NOT done here — we want the user to see the
    loaded code in the editor even if it's broken, and only get errors on
    Generate. The exception is RDF/XML: if rdflib can't parse it, we can't
    convert it to Turtle, so the upload has to fail.
    """
    filename = file.filename or "upload.ttl"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "ttl"
    data = await file.read()

    # Turtle: just hand the content back as-is — no parsing, no validation.
    # Any syntax / SHACL issues will surface when the user clicks Generate.
    if ext == "ttl":
        try:
            turtle = data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(400, "File is not valid UTF-8 text")
        return {"turtle": turtle, "filename": filename}

    # RDF/XML or anything else: must go through rdflib to be converted to Turtle.
    fmt = "xml" if ext == "rdf" else "turtle"
    try:
        g = Graph()
        g.parse(data=data, format=fmt)
        turtle = g.serialize(format="turtle")
        return {"turtle": turtle, "filename": filename}
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")


def _full_prompt_display(user_prompt: str) -> str:
    """Compose the system + user messages into a single readable block for the UI.

    This is what the frontend shows in the "Preprocessed input sent to LLM"
    accordion — the entire prompt exactly as the model receives it, including
    the system role, the few-shot example, the task intro, and the input.
    """
    return (
        "=== SYSTEM MESSAGE ===\n"
        f"{SYSTEM_PROMPT}\n\n"
        "=== USER MESSAGE ===\n"
        f"{user_prompt}"
    )


def _append_stage(existing: str, header: str, user_prompt: str) -> str:
    """Append a follow-up pass (reflection, refinement, …) to the shown prompt.

    The system message does not change between calls, so only the new user
    message is appended, with a clear separator so viewers can see both the
    first-pass and the reflection/refinement input side by side.
    """
    return (
        f"{existing}\n\n"
        "═══════════════════════════════════════════════════════\n"
        f"{header}\n"
        "═══════════════════════════════════════════════════════\n\n"
        f"{user_prompt}"
    )


def _run_pipeline(turtle: str, mode: str, model: str, reflection: bool) -> GenerationResult:
    validate_shacl_turtle(turtle)

    if mode == "a":
        prepared_raw = prepare_mode_a(turtle)
        user_prompt = build_prompt(prepared_raw, mode, raw_turtle=turtle)
        result = call_llm(user_prompt, model)
        display_prompt = _full_prompt_display(user_prompt)
    elif mode == "b":
        # Mode B is invoked per-constraint, but the runtime now passes the
        # full raw Turtle as background context so the LLM can resolve names
        # and types. The intro in `_INTROS["b"]` is explicit that the model
        # must explain ONLY the listed constraint and not the rest of the
        # shape. No marker prompts — Mode B is excluded from the hover-
        # highlight feature in the UI.
        parts = prepare_mode_b(turtle)
        user_prompts = [build_prompt(p, mode, raw_turtle=turtle) for p in parts]
        rs = [call_llm(p, model) for p in user_prompts]
        prepared_raw = "\n".join(parts)
        display_prompt = _full_prompt_display(
            "\n\n---\n\n".join(user_prompts)
        )
        result = {
            "text": "\n\n".join(r["text"] for r in rs),
            "prompt_tokens": sum(r["prompt_tokens"] for r in rs),
            "completion_tokens": sum(r["completion_tokens"] for r in rs),
            "cost": sum(r.get("cost", 0.0) for r in rs),
            "elapsed_s": round(sum(r["elapsed_s"] for r in rs), 2),
        }
    else:
        prepared_raw = prepare_mode_c(turtle)
        user_prompt = build_prompt(prepared_raw, mode)
        result = call_llm(user_prompt, model)
        display_prompt = _full_prompt_display(user_prompt)

    if reflection:
        reflection_user_prompt = build_reflection_prompt(prepared_raw, result["text"])
        r2 = call_llm(reflection_user_prompt, model)
        result["text"] = r2["text"]
        result["prompt_tokens"] += r2["prompt_tokens"]
        result["completion_tokens"] += r2["completion_tokens"]
        result["cost"] = result.get("cost", 0.0) + r2.get("cost", 0.0)
        result["elapsed_s"] = round(result["elapsed_s"] + r2["elapsed_s"], 2)
        display_prompt = _append_stage(
            display_prompt,
            "=== REFLECTION PASS · USER MESSAGE ===",
            reflection_user_prompt,
        )

    return GenerationResult(
        explanation=result["text"],
        preprocessed=display_prompt,
        tokens=result["prompt_tokens"] + result["completion_tokens"],
        cost=result.get("cost", 0.0),
        elapsed_s=result["elapsed_s"],
        model=model,
        mode=mode,
    )


@app.post("/api/generate", response_model=GenerationResult)
def generate(req: GenerateRequest):
    try:
        return _run_pipeline(req.turtle, req.mode, req.model, req.reflection)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(502, str(e))


# ──────────────────────── Streaming generation ────────────────────
# Emits newline-delimited JSON (NDJSON). Event shapes:
#   {"type": "preprocessed", "text": ...}   — the preprocessed input, sent once up front
#   {"type": "delta", "text": ...}          — incremental explanation text
#   {"type": "reflect_start"}               — reflection pass begins; client clears displayed text
#   {"type": "done", tokens, cost, elapsed_s, model, mode, preprocessed}
#   {"type": "error", "status": int, "message": ...}
def _ndjson(event: dict) -> str:
    return json.dumps(event) + "\n"


def _stream_pipeline(turtle: str, mode: str, model: str, reflection: bool) -> Iterator[str]:
    validate_shacl_turtle(turtle)

    if mode == "a":
        prepared_raw = prepare_mode_a(turtle)
        prompts = [build_prompt(prepared_raw, mode, raw_turtle=turtle)]
        display_prompt = _full_prompt_display(prompts[0])
    elif mode == "b":
        parts = prepare_mode_b(turtle)
        prompts = [build_prompt(p, mode, raw_turtle=turtle) for p in parts]
        prepared_raw = "\n".join(parts)
        display_prompt = _full_prompt_display("\n\n---\n\n".join(prompts))
    else:
        prepared_raw = prepare_mode_c(turtle)
        prompts = [build_prompt(prepared_raw, mode)]
        display_prompt = _full_prompt_display(prompts[0])

    # Show the full prompt (system + user) as the "preprocessed input" so
    # viewers see exactly what the model receives.
    yield _ndjson({"type": "preprocessed", "text": display_prompt})

    totals = {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0, "elapsed_s": 0.0}

    def run(prompt: str, sink: list[str]) -> Iterator[str]:
        """Stream one LLM call into ``sink``, folding its final usage into ``totals``."""
        for ev in stream_llm(prompt, model):
            if ev["type"] == "delta":
                sink.append(ev["text"])
                yield _ndjson(ev)
            else:  # meta
                totals["prompt_tokens"] += ev["prompt_tokens"]
                totals["completion_tokens"] += ev["completion_tokens"]
                totals["cost"] += ev["cost"]
                totals["elapsed_s"] += ev["elapsed_s"]

    # Mode B concatenates its per-constraint calls with blank lines between them.
    collected: list[str] = []
    for i, prompt in enumerate(prompts):
        if i > 0:
            yield _ndjson({"type": "delta", "text": "\n\n"})
        part: list[str] = []
        yield from run(prompt, part)
        collected.append("".join(part))

    if reflection:
        # The reflection pass produces the final visible text, so tell the client
        # to clear what it has shown so far, then stream the improved version.
        reflection_user_prompt = build_reflection_prompt(prepared_raw, "\n\n".join(collected))
        yield _ndjson({"type": "reflect_start"})
        # Update the visible prompt to include the reflection stage so the
        # user can inspect both passes side by side in the accordion.
        display_prompt = _append_stage(
            display_prompt,
            "=== REFLECTION PASS · USER MESSAGE ===",
            reflection_user_prompt,
        )
        yield _ndjson({"type": "preprocessed", "text": display_prompt})
        yield from run(reflection_user_prompt, [])

    yield _ndjson({
        "type": "done",
        "tokens": totals["prompt_tokens"] + totals["completion_tokens"],
        "cost": round(totals["cost"], 6),
        "elapsed_s": round(totals["elapsed_s"], 2),
        "model": model,
        "mode": mode,
        "preprocessed": display_prompt,
    })


def _stream_events(turtle: str, mode: str, model: str, reflection: bool) -> Iterator[str]:
    try:
        yield from _stream_pipeline(turtle, mode, model, reflection)
    except ValueError as e:
        yield _ndjson({"type": "error", "status": 400, "message": str(e)})
    except RuntimeError as e:
        yield _ndjson({"type": "error", "status": 502, "message": str(e)})


@app.post("/api/generate/stream")
def generate_stream(req: GenerateRequest):
    return StreamingResponse(
        _stream_events(req.turtle, req.mode, req.model, req.reflection),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _build_refine_prompt(previous_output: str, instruction: str) -> str:
    """The user message for a refinement pass.

    We do NOT try to preserve the `<!-- ref: X -->` reference markers here:
    the frontend's hover-to-highlight feature is deliberately disabled after
    a refinement (see the demo-build design notes). Refinement instructions
    like "turn this into a bullet list" restructure paragraphs in ways that
    make marker preservation unreliable; instead of chasing every edge case
    we strip the markers so the refined output is purely presentational.
    """
    return (
        f"Here is a natural language explanation of a SHACL shape:\n\n"
        f"{previous_output}\n\n"
        f"Please refine it with the following instruction: {instruction}\n\n"
        "Remove any `<!-- ref: ... -->` reference markers from the previous "
        "output — do not include them in your response. Focus purely on the "
        "prose."
    )


def _refinement_stage_block(prompt: str) -> str:
    """Wrap a refinement user prompt in the append-ready separator block."""
    return _append_stage(
        existing="",  # frontend appends this to the previous preprocessed
        header="=== REFINEMENT PASS · USER MESSAGE ===",
        user_prompt=prompt,
    ).lstrip("\n")


@app.post("/api/refine", response_model=GenerationResult)
def refine(req: RefineRequest):
    prompt = _build_refine_prompt(req.previous_output, req.instruction)
    try:
        result = call_llm(prompt, req.model)
        return GenerationResult(
            explanation=result["text"],
            # Expose the refinement's user prompt so the client can append it
            # to the previous preprocessed block, mirroring the reflection
            # stage. The system message is unchanged from the initial call,
            # so we only return the refinement-specific user prompt.
            preprocessed=_refinement_stage_block(prompt),
            tokens=result["prompt_tokens"] + result["completion_tokens"],
            cost=result.get("cost", 0.0),
            elapsed_s=result["elapsed_s"],
            model=req.model,
            mode="refine",
        )
    except RuntimeError as e:
        raise HTTPException(502, str(e))


def _stream_refine(previous_output: str, instruction: str, model: str) -> Iterator[str]:
    """Stream a refinement pass token by token.

    Emits the same NDJSON event shape as `_stream_pipeline`:
      preprocessed → delta … → done  (or error)
    """
    prompt = _build_refine_prompt(previous_output, instruction)
    yield _ndjson({"type": "preprocessed", "text": _refinement_stage_block(prompt)})

    totals = {"prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0, "elapsed_s": 0.0}
    for ev in stream_llm(prompt, model):
        if ev["type"] == "delta":
            yield _ndjson(ev)
        else:  # meta
            totals["prompt_tokens"] += ev["prompt_tokens"]
            totals["completion_tokens"] += ev["completion_tokens"]
            totals["cost"] += ev["cost"]
            totals["elapsed_s"] += ev["elapsed_s"]

    yield _ndjson({
        "type": "done",
        "tokens": totals["prompt_tokens"] + totals["completion_tokens"],
        "cost": round(totals["cost"], 6),
        "elapsed_s": round(totals["elapsed_s"], 2),
        "model": model,
        "mode": "refine",
        "preprocessed": _refinement_stage_block(prompt),
    })


def _stream_refine_events(previous_output: str, instruction: str, model: str) -> Iterator[str]:
    try:
        yield from _stream_refine(previous_output, instruction, model)
    except RuntimeError as e:
        yield _ndjson({"type": "error", "status": 502, "message": str(e)})


@app.post("/api/refine/stream")
def refine_stream(req: RefineRequest):
    return StreamingResponse(
        _stream_refine_events(req.previous_output, req.instruction, req.model),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
