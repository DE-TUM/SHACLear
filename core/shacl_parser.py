"""SHACL parsing and Mode A/B/C preprocessing.

Pure parsing logic — no HTTP, no Streamlit, no FastAPI. Given a SHACL Turtle
document, produce one of three structured representations to feed to an LLM.
"""
from __future__ import annotations

from rdflib import Graph, Namespace, RDF, Literal, BNode, URIRef

SH = Namespace("http://www.w3.org/ns/shacl#")

# Previously we filtered these predicates out as "noise". In practice the
# reference dataset uses them heavily — `sh:name`, `sh:description`,
# `rdfs:label`, `rdfs:comment` carry real human context the LLM can use.
# So we now include all of them. Only structural predicates (`sh:path`,
# `rdf:type`) are still skipped because they're not validation rules.
METADATA_PREDICATES: set[str] = set()

# Constraints that can appear at the NodeShape level (outside sh:property blocks)
SHAPE_LEVEL_CONSTRAINTS = {
    # Validation constructs
    "closed", "ignoredProperties",
    "or", "and", "not", "xone",
    "targetNode", "targetSubjectsOf", "targetObjectsOf",
    "hasValue", "in",
    # Descriptive metadata — used by the LLM for context
    "name", "description", "label", "comment",
    "message", "severity", "order", "group", "deactivated",
}


# ── Validation ───────────────────────────────────────────────────────────────
def validate_shacl_turtle(turtle: str) -> None:
    """Validate SHACL Turtle in two stages.

    Stage 1 – RDFLib syntax check: is it valid Turtle?
    Stage 2 – PySHACL structural check: is it a valid SHACL document?

    Raises ValueError with a human-readable message on failure.
    """
    try:
        Graph().parse(data=turtle, format="turtle")
    except Exception as e:
        raise ValueError(f"Invalid Turtle syntax: {e}") from e

    try:
        from pyshacl import validate
        validate(
            turtle,
            shacl_graph=None,
            data_graph_format="turtle",
            inference="none",
            abort_on_first=False,
            allow_infos=True,
        )
    except Exception as e:
        raise ValueError(f"Invalid SHACL structure: {e}") from e


# ── Parsing helpers ──────────────────────────────────────────────────────────
def _parse_graph(turtle: str) -> Graph:
    g = Graph()
    g.parse(data=turtle, format="turtle")
    return g


def _local_name(uri) -> str:
    """Return last fragment of a URI/string."""
    s = str(uri)
    return s.split("#")[-1].split("/")[-1]


def _resolve_path(g: Graph, path) -> str:
    """Resolve sh:path expressions, including complex SHACL property paths.

    Supports:
      - Simple predicate path: ex:name → "name"
      - Inverse path: [ sh:inversePath ex:author ] → "^author"
      - Sequence path: ( ex:a ex:b ) → "a / b"
      - Alternative path: [ sh:alternativePath ( ex:a ex:b ) ] → "a | b"
      - Zero-or-more path: [ sh:zeroOrMorePath ex:a ] → "a*"
      - One-or-more path: [ sh:oneOrMorePath ex:a ] → "a+"
      - Zero-or-one path: [ sh:zeroOrOnePath ex:a ] → "a?"
    """
    if path is None:
        return "–"

    if isinstance(path, URIRef):
        return _local_name(path)

    if isinstance(path, BNode):
        inv = g.value(path, SH.inversePath)
        if inv is not None:
            return f"^{_resolve_path(g, inv)}"
        alt = g.value(path, SH.alternativePath)
        if alt is not None:
            parts = []
            current = alt
            while current and current != RDF.nil:
                item = g.value(current, RDF.first)
                if item is not None:
                    parts.append(_resolve_path(g, item))
                current = g.value(current, RDF.rest)
            return " | ".join(parts) if parts else "<empty-alt>"
        zom = g.value(path, SH.zeroOrMorePath)
        if zom is not None:
            return f"{_resolve_path(g, zom)}*"
        oom = g.value(path, SH.oneOrMorePath)
        if oom is not None:
            return f"{_resolve_path(g, oom)}+"
        zoo = g.value(path, SH.zeroOrOnePath)
        if zoo is not None:
            return f"{_resolve_path(g, zoo)}?"

        # Sequence path (an RDF list directly)
        first = g.value(path, RDF.first)
        if first is not None:
            parts = []
            current = path
            while current and current != RDF.nil:
                item = g.value(current, RDF.first)
                if item is not None:
                    parts.append(_resolve_path(g, item))
                current = g.value(current, RDF.rest)
            return " / ".join(parts) if parts else "<empty-seq>"

    return _local_name(path)


def _resolve_value(g: Graph, obj, _depth: int = 0) -> str:
    """Resolve an RDF node to a readable string."""
    if _depth > 5:
        return "<...>"

    if isinstance(obj, Literal):
        return str(obj)

    first = g.value(obj, RDF.first)
    if first is not None:
        values = []
        current = obj
        while current and current != RDF.nil:
            item = g.value(current, RDF.first)
            if item is not None:
                if isinstance(item, Literal):
                    values.append(str(item))
                else:
                    values.append(_resolve_value(g, item, _depth + 1))
            current = g.value(current, RDF.rest)
        return ", ".join(values)

    if isinstance(obj, BNode):
        # Check for embedded sh:sparql first
        select_query = g.value(obj, SH.select)
        ask_query = g.value(obj, SH.ask)
        if select_query is not None:
            return f"SPARQL SELECT: {str(select_query).strip()[:200]}"
        if ask_query is not None:
            return f"SPARQL ASK: {str(ask_query).strip()[:200]}"

        nested = []
        for pred, val in g.predicate_objects(obj):
            local = _local_name(pred)
            if local in METADATA_PREDICATES or local == "type":
                continue
            if local == "path":
                nested.append(f"path={_resolve_path(g, val)}")
            else:
                nested.append(f"{local}={_resolve_value(g, val, _depth + 1)}")
        if nested:
            return "{" + ", ".join(nested) + "}"
        return "<unspecified>"

    if isinstance(obj, URIRef):
        if (obj, RDF.type, SH.NodeShape) in g or (obj, RDF.type, SH.PropertyShape) in g:
            return f"→ {_local_name(obj)}"
        return _local_name(obj)

    return _local_name(obj)


def _resolve_logical_group(g: Graph, list_head) -> str:
    """Resolve sh:or / sh:and / sh:xone — a list of nested shapes."""
    parts = []
    current = list_head
    while current and current != RDF.nil:
        item = g.value(current, RDF.first)
        if item is not None:
            parts.append(_resolve_value(g, item))
        current = g.value(current, RDF.rest)
    return " | ".join(parts) if parts else "<empty>"


def _extract_sparql_constraints(g: Graph, subject) -> list[str]:
    """Extract sh:sparql constraints attached to a subject as readable strings."""
    out = []
    for sparql_node in g.objects(subject, SH.sparql):
        select_q = g.value(sparql_node, SH.select)
        ask_q = g.value(sparql_node, SH.ask)
        message = g.value(sparql_node, SH.message)
        kind = "SPARQL SELECT" if select_q is not None else ("SPARQL ASK" if ask_q is not None else "SPARQL")
        query = select_q if select_q is not None else ask_q

        if message:
            out.append(f'"{str(message).strip()}" (defined via {kind})')
        elif query is not None:
            out.append(f"{kind} query: {str(query).strip()}")
    return out


def _extract_constraints(g: Graph) -> list[dict]:
    """Return one dict per sh:property block AND shape-level constraints."""
    constraints = []
    for shape in g.subjects(RDF.type, SH.NodeShape):
        target = g.value(shape, SH.targetClass)
        shape_name = _local_name(shape)
        target_name = _local_name(target) if target else "–"

        # ── Shape-level constraints ─────────────────────────────────────
        shape_rules: dict[str, str] = {}
        for pred, obj in g.predicate_objects(shape):
            local = _local_name(pred)
            if local in METADATA_PREDICATES:
                continue
            if local == "sparql":
                continue
            if local not in SHAPE_LEVEL_CONSTRAINTS:
                continue
            if local in {"or", "and", "xone"}:
                shape_rules[local] = _resolve_logical_group(g, obj)
            else:
                shape_rules[local] = _resolve_value(g, obj)

        sparql_constraints = _extract_sparql_constraints(g, shape)
        if sparql_constraints:
            shape_rules["sparql"] = " || ".join(sparql_constraints)

        if shape_rules:
            constraints.append({
                "shape": shape_name,
                "target": target_name,
                "property": "(shape-level)",
                "rules": shape_rules,
            })

        # ── Property-level constraints ──────────────────────────────────
        for prop in g.objects(shape, SH.property):
            path = g.value(prop, SH.path)
            entry: dict = {
                "shape": shape_name,
                "target": target_name,
                "property": _resolve_path(g, path),
                "rules": {},
            }
            for pred, obj in g.predicate_objects(prop):
                local = _local_name(pred)
                if local == "path" or local == "type":
                    continue
                if local in METADATA_PREDICATES:
                    continue
                if local == "sparql":
                    continue
                if local in {"or", "and", "xone"}:
                    entry["rules"][local] = _resolve_logical_group(g, obj)
                else:
                    entry["rules"][local] = _resolve_value(g, obj)

            for sparql_str in _extract_sparql_constraints(g, prop):
                entry["rules"]["sparql"] = sparql_str

            # Merge qualifiedValueShape + qualifiedMinCount/qualifiedMaxCount
            qvs = entry["rules"].pop("qualifiedValueShape", None)
            qmin = entry["rules"].pop("qualifiedMinCount", None)
            qmax = entry["rules"].pop("qualifiedMaxCount", None)
            if qvs is not None:
                if qmin and qmax:
                    entry["rules"]["qualified"] = f"between {qmin} and {qmax} must match {qvs}"
                elif qmin:
                    entry["rules"]["qualified"] = f"at least {qmin} must match {qvs}"
                elif qmax:
                    entry["rules"]["qualified"] = f"at most {qmax} must match {qvs}"
                else:
                    entry["rules"]["qualified"] = f"some must match {qvs}"
            elif qmin or qmax:
                if qmin: entry["rules"]["qualifiedMinCount"] = qmin
                if qmax: entry["rules"]["qualifiedMaxCount"] = qmax

            if entry["rules"]:
                constraints.append(entry)
    return constraints


# ── Mode A/B/C preparation ───────────────────────────────────────────────────
SHAPE_LEVEL_PHRASING = {
    # Validation
    "or":                "At least one of",
    "and":               "All of",
    "xone":              "Exactly one of",
    "not":               "Must NOT match",
    "closed":            "Closed (no additional properties allowed beyond those listed)",
    "ignoredProperties": "Ignored properties",
    "hasValue":          "Must include value",
    "in":                "Must be one of",
    "sparql":            "SPARQL rule",
    # Descriptive metadata (rendered as context, not as a rule)
    "name":              "Name",
    "description":       "Description",
    "label":             "Label",
    "comment":           "Comment",
    "message":           "Error message",
    "severity":          "Severity",
    "order":             "Display order",
    "group":             "UI group",
    "deactivated":       "Deactivated",
}

# Keys that are metadata (informational), not validation rules.
# Used by Mode B to phrase them differently.
METADATA_KEYS = {
    "name", "description", "label", "comment",
    "message", "severity", "order", "group", "deactivated",
}


def _is_shape_level(constraint: dict) -> bool:
    return constraint.get("property") == "(shape-level)"


def prepare_mode_a(turtle: str) -> str:
    """Mode A – Structured: shape as Property/Type/Rule table."""
    g = _parse_graph(turtle)
    constraints = _extract_constraints(g)
    if not constraints:
        return turtle

    by_shape: dict[tuple[str, str], dict] = {}
    for c in constraints:
        key = (c["shape"], c["target"])
        if key not in by_shape:
            by_shape[key] = {"shape_level": [], "properties": []}
        if _is_shape_level(c):
            by_shape[key]["shape_level"].append(c)
        else:
            by_shape[key]["properties"].append(c)

    lines: list[str] = []
    for (shape, target), groups in by_shape.items():
        if target == "–":
            lines.append(f"Shape: {shape}  |  (helper shape — referenced by other shapes)")
        else:
            lines.append(f"Shape: {shape}  |  Target class: {target}")
        lines.append("")

        if groups["shape_level"]:
            lines.append("Shape-level constraints:")
            merged_rules: dict[str, str] = {}
            for c in groups["shape_level"]:
                merged_rules.update(c["rules"])

            closed_val = merged_rules.pop("closed", None)
            ignored_val = merged_rules.pop("ignoredProperties", None)
            if closed_val is not None and str(closed_val).lower() == "true":
                if ignored_val:
                    lines.append(f"  - Closed: only the listed properties are allowed (except: {ignored_val})")
                else:
                    lines.append("  - Closed: only the listed properties are allowed")
            elif ignored_val:
                lines.append(f"  - Ignored properties: {ignored_val}")

            for rule, value in merged_rules.items():
                phrasing = SHAPE_LEVEL_PHRASING.get(rule, rule)
                lines.append(f"  - {phrasing}: {value}")
            lines.append("")

        if groups["properties"]:
            lines.append("Property constraints:")
            lines.append(f"{'Property':<20} {'Rule':<20} {'Value'}")
            lines.append("-" * 55)
            for c in groups["properties"]:
                for rule, value in c["rules"].items():
                    prop = c["property"] if rule == list(c["rules"])[0] else ""
                    lines.append(f"{prop:<20} {rule:<20} {value}")
            lines.append("")

    return "\n".join(lines)


def prepare_mode_b(turtle: str) -> list[str]:
    """Mode B – Fine-Grained: one string per individual constraint."""
    g = _parse_graph(turtle)
    constraints = _extract_constraints(g)
    if not constraints:
        return [turtle]

    shape_level_by_shape: dict[str, dict[str, str]] = {}
    for c in constraints:
        if _is_shape_level(c):
            shape_level_by_shape.setdefault(c["shape"], {}).update(c["rules"])

    result: list[str] = []
    emitted_shape_level: set[str] = set()
    for c in constraints:
        if _is_shape_level(c):
            shape = c["shape"]
            if shape in emitted_shape_level:
                continue
            emitted_shape_level.add(shape)

            merged = dict(shape_level_by_shape[shape])
            closed_val = merged.pop("closed", None)
            ignored_val = merged.pop("ignoredProperties", None)

            if closed_val is not None and str(closed_val).lower() == "true":
                if ignored_val:
                    result.append(
                        f"Shape '{shape}' is closed — only the listed properties are allowed (except for: {ignored_val})."
                    )
                else:
                    result.append(
                        f"Shape '{shape}' is closed — only the listed properties are allowed."
                    )
            elif ignored_val:
                result.append(f"Shape '{shape}' allows these ignored properties: {ignored_val}")

            for rule, value in merged.items():
                phrasing = SHAPE_LEVEL_PHRASING.get(rule, rule)
                if rule in {"or", "and", "xone"}:
                    result.append(f"Shape '{shape}' must satisfy {phrasing.lower()}: {value}")
                elif rule == "not":
                    result.append(f"Shape '{shape}' must NOT match the pattern: {value}")
                elif rule == "sparql":
                    result.append(f"Shape '{shape}' has a SPARQL rule: {value}")
                elif rule in METADATA_KEYS:
                    result.append(f"Shape '{shape}' — {phrasing}: {value}")
                else:
                    result.append(f"Shape '{shape}' {phrasing.lower()}: {value}")
        else:
            for rule, value in c["rules"].items():
                if rule == "node":
                    target_shape = str(value).lstrip("→ ").strip()
                    result.append(
                        f"Shape '{c['shape']}': property '{c['property']}' values must conform to shape '{target_shape}'"
                    )
                elif rule == "qualified":
                    result.append(
                        f"Shape '{c['shape']}': property '{c['property']}' values: {value}"
                    )
                elif rule in METADATA_KEYS:
                    phrasing = SHAPE_LEVEL_PHRASING.get(rule, rule)
                    result.append(
                        f"Shape '{c['shape']}': property '{c['property']}' — {phrasing}: {value}"
                    )
                else:
                    result.append(
                        f"Shape '{c['shape']}': property '{c['property']}' must satisfy "
                        f"{rule} = {value}"
                    )
    return result


def prepare_mode_c(turtle: str) -> str:
    """Mode C – Baseline: raw Turtle passed through unchanged."""
    return turtle
