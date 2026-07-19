"""Prompt building for SHACL → Natural Language.

Provides the system prompt, few-shot examples per mode, and helpers to wrap a
preprocessed SHACL input into the final LLM prompt.
"""
from __future__ import annotations

SYSTEM_PROMPT = "\n".join([
    "You are an expert in knowledge graph data quality.",
    "Explain the following SHACL shape in plain English for a non-technical user.",
    "Be accurate and avoid all SHACL-specific jargon.",
    "If an error message is present, quote it in your explanation.",
    "Write one short paragraph per constraint (and one summary paragraph",
    "per shape) — keep individual paragraphs concise, but cover EVERY",
    "constraint of EVERY shape in the input. Length scales with the shape.",
    "",
    "REFERENCE MARKERS — IMPORTANT:",
    "Structure your explanation so each paragraph describes ONE specific",
    "constraint or shape, and prefix every paragraph with an HTML reference",
    "marker that names what it describes:",
    "",
    "    <!-- ref: propertyName -->",
    "    Natural fluent prose about that property's constraint(s).",
    "",
    "    <!-- ref: shape:ShapeName -->",
    "    Natural fluent prose about the shape as a whole.",
    "",
    "    <!-- ref: shape:closed -->",
    "    Natural fluent prose about a shape-level constraint (closed, or, and,",
    "    xone, in, hasValue, sparql).",
    "",
    "Rules:",
    "1. Write FLUENT, NATURAL prose inside each paragraph — full sentences,",
    "   not fragments. The marker is metadata that sits ABOVE the paragraph;",
    "   the prose itself reads naturally on its own.",
    "2. ONE marker per paragraph. Separate paragraphs with a blank line.",
    "3. Use the EXACT property/shape name as it appears in the raw Turtle code",
    "   (just the local name — e.g. `title`, not `ex:title` or `BookShape.title`).",
    "   For shape-level constraints, prefix with `shape:` (e.g. `shape:closed`).",
    "   For a whole-shape summary paragraph, use `shape:ShapeName`.",
    "4. If multiple constraints apply to the same property (e.g. minCount AND",
    "   datatype on `title`), combine them in ONE paragraph under one marker.",
    "5. If the input contains MULTIPLE shapes (e.g. PersonShape AND AddressShape),",
    "   give EVERY property of EVERY shape its own marked paragraph. Never",
    "   collapse a secondary shape's properties into a single summary sentence.",
    "   Then add ONE shape-level summary paragraph per shape, in the order the",
    "   shapes appear in the Turtle.",
    "6. If you cannot confidently identify which constraint a paragraph refers",
    "   to, leave it unmarked rather than guessing.",
    "7. Never invent property or shape names that aren't in the Turtle.",
    "",
    "Your explanation must read naturally when the marker comments are removed.",
])

# All three few-shot examples are derived from the SAME underlying BookShape
# so the mode-comparison isolates the input REPRESENTATION as the variable —
# constraint complexity and domain are held constant across A/B/C.
#
# For Mode A and Mode B the few-shot mirrors the EXACT structure of the real
# user message (raw Turtle context block + structured representation), so the
# LLM never sees a format mismatch between demonstration and inference.

_BOOK_TURTLE = (
    "ex:BookShape a sh:NodeShape ;\n"
    "    sh:targetClass ex:Book ;\n"
    "    sh:property [ sh:path ex:title ; sh:datatype xsd:string ; sh:minCount 1 ] ;\n"
    "    sh:property [ sh:path ex:pages ; sh:datatype xsd:integer ; sh:minInclusive 1 ] ."
)

_FEW_SHOT_A = f"""
Example input:

Full SHACL shape in raw Turtle (for complete context — use this to understand the full shape before reading the structured breakdown below):

{_BOOK_TURTLE}

---

Explain the following SHACL shape, provided as a structured constraint table:

Shape: BookShape  |  Target class: Book
Property             Rule                 Value
-------------------------------------------------------
title                minCount             1
title                datatype             string
pages                datatype             integer
pages                minInclusive         1

Example output:
<!-- ref: title -->
Every Book must have at least one title, and that title must be plain text.

<!-- ref: pages -->
The page count, if provided, must be a whole number of at least 1.

<!-- ref: shape:BookShape -->
Together these rules describe what makes a valid Book record: a required title plus an optional page count.
"""

# Mode B is invoked per-constraint, but the runtime still prepends the full
# raw Turtle as context (so names/types can be resolved). The few-shot
# therefore mirrors that exact structure — raw Turtle followed by a single
# constraint string — and demonstrates the desired behaviour: the LLM
# explains ONLY the listed constraint, even though it can see the rest of
# the shape in the Turtle above. No marker comments — Mode B is excluded
# from the hover-highlight feature.
_FEW_SHOT_B = f"""
Example input:

Full SHACL shape in raw Turtle (background context only — use to resolve names and types; do NOT explain):

{_BOOK_TURTLE}

---

Explain the following individual SHACL constraint in plain English:

Shape 'BookShape': property 'title' must satisfy minCount = 1

Example output:
Every Book must have at least one title.
"""

_FEW_SHOT_C = f"""
Example input (raw Turtle):
{_BOOK_TURTLE}

Example output:
<!-- ref: title -->
Every Book must have at least one title, and that title must be plain text.

<!-- ref: pages -->
The page count, if provided, must be a whole number of at least 1.

<!-- ref: shape:BookShape -->
Together these rules describe what makes a valid Book record: a required title plus an optional page count.
"""

_FEW_SHOTS = {"a": _FEW_SHOT_A, "b": _FEW_SHOT_B, "c": _FEW_SHOT_C}

_INTROS = {
    "a": "Explain the following SHACL shape, provided as a structured constraint table:",
    "b": (
        "Explain ONLY the single SHACL constraint listed below. "
        "The raw Turtle above is provided ONLY as background context — so you can "
        "resolve property names, datatypes, and references — and MUST NOT be "
        "described, summarised, or paraphrased. Do not mention any other property, "
        "shape-level rule, or constraint that appears in the Turtle but is not the "
        "one constraint listed here. Produce exactly ONE short paragraph (one or "
        "two sentences) that describes only this single constraint in plain "
        "English. No bullet lists, no preamble, no shape summary."
    ),
    "c": "Explain the following SHACL shape, provided in raw Turtle syntax:",
}


def build_prompt(prepared_input: str, mode_key: str, raw_turtle: str | None = None) -> str:
    """Build the *user* message: a few-shot example plus the preprocessed SHACL input.

    The system instruction (`SYSTEM_PROMPT`) is intentionally NOT included here —
    it is sent separately in the `system` role by `call_llm`.

    For Modes A and B, the full raw Turtle is prepended as additional context.
    - Mode A combines a structured table with the raw Turtle (overview + detail).
    - Mode B is invoked per-constraint; the raw Turtle lets the model resolve
      names and types, but the intro instructs it explicitly NOT to explain any
      constraints beyond the single one provided. Mode B still uses no marker
      prompts and is excluded from the hover-highlight flow in the UI.
    Mode C already receives the raw Turtle as its primary input, so the extra
    context block is omitted there.
    """
    intro = _INTROS.get(mode_key, "Explain the following SHACL shape:")
    few_shot = _FEW_SHOTS.get(mode_key, "")

    if raw_turtle and mode_key in ("a", "b"):
        context_block = (
            "Full SHACL shape in raw Turtle (for complete context — use this to understand "
            "the full shape before reading the structured breakdown below):\n\n"
            f"{raw_turtle.strip()}\n\n"
            "---\n\n"
        )
    else:
        context_block = ""

    return f"{few_shot}\nNow do the same for this input:\n\n{context_block}{intro}\n\n{prepared_input}"


def build_reflection_prompt(original_input: str, first_explanation: str) -> str:
    """Ask the LLM to verify and improve its own first explanation."""
    return (
        "You previously explained a SHACL shape. Check your explanation against the original input.\n\n"
        f"ORIGINAL SHAPE:\n{original_input}\n\n"
        f"YOUR EXPLANATION:\n{first_explanation}\n\n"
        "Ask yourself:\n"
        "1. Is every property and constraint mentioned?\n"
        "2. Is any SHACL jargon used that should be plain English?\n"
        "3. Are reference markers (`<!-- ref: ... -->`) preserved on each paragraph?\n\n"
        "If everything is correct and complete, return the explanation unchanged.\n"
        "Otherwise return only the improved explanation, nothing else."
    )
