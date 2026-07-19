/**
 * Build a map of `propertyName → line ranges` from a Turtle SHACL document.
 *
 * Used by the hover-highlight feature: when the user hovers a paragraph in
 * the explanation that's tagged with `<!-- ref: propertyName -->`, we look
 * up the corresponding line ranges here and decorate the editor lines.
 *
 * Handles:
 *   • Inline blank-node property shapes:  sh:property [ sh:path ex:name ; ... ]
 *   • Named property shapes:              ex:hasBuyerShape a sh:PropertyShape ; sh:path ex:hasBuyer ; ...
 *   • Shape-level constraints:            sh:closed true ;  →  ref "shape:closed"
 */

export interface LineRange {
  /** 1-based, inclusive */
  start: number;
  /** 1-based, inclusive */
  end: number;
}

export type PropertyLineMap = Map<string, LineRange[]>;

const SHAPE_LEVEL_PREDICATES = [
  'closed', 'ignoredProperties',
  'or', 'and', 'not', 'xone',
  'hasValue', 'in',
];

/** Strip strings, IRIs and comments — keeps newlines for accurate line numbers. */
function maskText(text: string): string {
  return text
    .replace(/"""[\s\S]*?"""/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'''[\s\S]*?'''/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<[^>]*>/g, (m) => ' '.repeat(m.length))
    .replace(/#[^\n]*/g, (m) => ' '.repeat(m.length));
}

function extractLocalName(rawPathToken: string): string {
  // rawPathToken is either "prefix:name" or "name" or starts with a recovered IRI segment
  // Take last part after : or / or #
  const cleaned = rawPathToken.trim();
  const m = cleaned.match(/(?:^|[:/#])([a-zA-Z_][\w-]*)\s*$/);
  return m ? m[1] : cleaned;
}

export function extractPropertyLineMap(turtle: string): PropertyLineMap {
  const map: PropertyLineMap = new Map();
  const masked = maskText(turtle).split('\n');

  collectInlineBlocks(masked, map);
  collectNamedPropertyShapes(masked, map);
  collectShapeLevel(masked, map);
  collectShapeOverviews(masked, map);

  return map;
}

/* ───────── Inline blank-node property shapes ──────────────────────────── */

function collectInlineBlocks(maskedLines: string[], map: PropertyLineMap): void {
  let depth = 0;
  let blockStart = -1;
  let currentPath: string | null = null;

  for (let i = 0; i < maskedLines.length; i++) {
    const line = maskedLines[i];

    // Detect sh:path while we're inside a block
    if (depth > 0) {
      const pm = line.match(/sh:path\s+([a-zA-Z][\w-]*:[a-zA-Z_][\w-]*)/);
      if (pm) currentPath = extractLocalName(pm[1]);
    }

    // Walk characters to track bracket depth precisely
    for (const ch of line) {
      if (ch === '[') {
        if (depth === 0) {
          blockStart = i;
          currentPath = null;
        }
        depth++;
      } else if (ch === ']') {
        depth--;
        if (depth === 0 && currentPath && blockStart >= 0) {
          const arr = map.get(currentPath) ?? [];
          arr.push({ start: blockStart + 1, end: i + 1 });
          map.set(currentPath, arr);
          currentPath = null;
          blockStart = -1;
        }
      }
    }
  }
}

/* ───────── Named property shapes ──────────────────────────────────────── */

function collectNamedPropertyShapes(maskedLines: string[], map: PropertyLineMap): void {
  // Find subjects declared as `a sh:PropertyShape` and capture lines until the
  // matching period `.` that ends the statement (at depth 0).

  let i = 0;
  while (i < maskedLines.length) {
    const line = maskedLines[i];
    // A subject line starts at column 0 (or near it) — look for `a sh:PropertyShape`
    if (/\bsh:PropertyShape\b/.test(line)) {
      // Walk forward to the terminating `.` at depth 0
      const start = i;
      let depth = 0;
      let end = i;
      let pathName: string | null = null;
      for (let j = i; j < maskedLines.length; j++) {
        for (const ch of maskedLines[j]) {
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '.' && depth === 0) {
            end = j;
            j = maskedLines.length; // break outer
            break;
          }
        }
        // Inside the named shape, capture the path
        const pm = maskedLines[j]?.match(/sh:path\s+([a-zA-Z][\w-]*:[a-zA-Z_][\w-]*)/);
        if (pm && pathName === null) pathName = extractLocalName(pm[1]);
        end = j;
      }

      if (pathName) {
        const arr = map.get(pathName) ?? [];
        arr.push({ start: start + 1, end: end + 1 });
        map.set(pathName, arr);
      }
      i = end + 1;
    } else {
      i++;
    }
  }
}

/* ───────── Shape-level constraints (NodeShape predicates at depth 0) ──── */

function collectShapeLevel(maskedLines: string[], map: PropertyLineMap): void {
  let depth = 0;
  for (let i = 0; i < maskedLines.length; i++) {
    const line = maskedLines[i];

    // Update depth BEFORE checking — only shape-level lines (depth 0) count.
    // Match the predicate first, then update brackets.
    if (depth === 0) {
      const predMatch = line.match(/\bsh:(\w+)\b/);
      if (predMatch) {
        const pred = predMatch[1];
        if (SHAPE_LEVEL_PREDICATES.includes(pred)) {
          const refName = `shape:${pred}`;
          // For 'or', 'and', 'xone', 'in', 'ignoredProperties' the value is a list — find the range
          const range = findValueRange(maskedLines, i, line.indexOf(predMatch[0]));
          const arr = map.get(refName) ?? [];
          arr.push(range);
          map.set(refName, arr);
        }
      }
    }

    for (const ch of line) {
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
    }
  }
}

/* ───────── Shape overviews — the NodeShape header (subject, type, target, …) ──
 *
 * Each shape gets its own ref under `shape:ShapeName` (the subject's local
 * name). This way `<!-- ref: shape:PersonShape -->` highlights ONLY the
 * Person shape's header — not every NodeShape in the document.
 */

function collectShapeOverviews(maskedLines: string[], map: PropertyLineMap): void {
  for (let i = 0; i < maskedLines.length; i++) {
    if (!/\ba\s+sh:NodeShape\b/.test(maskedLines[i])) continue;

    // Find the subject — either on the same line before "a sh:NodeShape",
    // or on the closest non-empty line above.
    let startLine = i;
    let subjectToken: string | null = null;

    const beforeA = maskedLines[i].replace(/\ba\s+sh:NodeShape.*$/, '').trim();
    if (beforeA) {
      subjectToken = beforeA;
    } else {
      for (let j = i - 1; j >= 0; j--) {
        const prev = maskedLines[j].trim();
        if (prev === '') continue;
        startLine = j;
        subjectToken = prev;
        break;
      }
    }
    if (!subjectToken) continue;

    const subjectName = extractLocalName(subjectToken);
    if (!subjectName) continue;

    // Walk forward to the line before the first `sh:property` at depth 0,
    // or to the terminating `.` if there are no properties.
    let endLine = i;
    let depth = 0;
    for (let j = i; j < maskedLines.length; j++) {
      const ln = maskedLines[j];

      if (depth === 0 && /\bsh:property\b/.test(ln) && j > startLine) {
        endLine = j - 1;
        break;
      }
      for (const ch of ln) {
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
      }
      endLine = j;
      if (depth === 0 && j > i && /\.\s*$/.test(ln)) break;
    }

    const range = { start: startLine + 1, end: endLine + 1 };

    // Canonical key: `shape:PersonShape`
    const refName = `shape:${subjectName}`;
    const arr = map.get(refName) ?? [];
    arr.push(range);
    map.set(refName, arr);

    // Bare-name alias: `PersonShape` — tolerates LLMs that omit the
    // `shape:` prefix. Only added if the bare name isn't already taken
    // by a property of the same name.
    if (!map.has(subjectName)) {
      map.set(subjectName, [range]);
    }
  }
}

/** Returns the line range starting at `startLine` covering the predicate's value. */
function findValueRange(lines: string[], startLine: number, startCol: number): LineRange {
  // Walk forward until we hit `;` or `.` at depth 0 (counting both [ ] and ( )).
  let depth = 0;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const from = i === startLine ? startCol : 0;
    for (let k = from; k < line.length; k++) {
      const ch = line[k];
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      else if ((ch === ';' || ch === '.') && depth === 0) {
        return { start: startLine + 1, end: i + 1 };
      }
    }
  }
  return { start: startLine + 1, end: lines.length };
}
