/**
 * Client-side Turtle syntax validator.
 *
 * n3.js v2 turned out to be far too lenient for our needs (it silently
 * accepts missing semicolons, undefined prefixes, even unclosed blocks).
 * Instead, we implement a focused set of heuristic checks that cover the
 * most common SHACL authoring mistakes — with PRECISE line numbers.
 *
 * Checks implemented (in order):
 *   1. Missing terminators between predicate-object pairs
 *      (e.g. forgotten ';' before the next predicate)
 *   2. Undeclared prefixes (`ex:Foo` without a matching `@prefix ex:`)
 *   3. Unbalanced brackets `[` `]` and parens `(` `)`
 *
 * The backend's PySHACL still runs afterwards for SHACL-semantic validation.
 */

export interface TurtleSyntaxError {
  /** 1-based line number of the failure */
  line: number;
  /** Cleaned-up parser message, ready to display */
  message: string;
  expected?: string;
  got?: string;
  undefinedPrefix?: string;
  raw: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */

/** Strip line/full-line comments + trailing # comments (but keep newlines). */
function stripComments(text: string): string {
  return text.replace(/(^|\s)#[^\n]*/g, '$1');
}

/** Replace string literals with same-length whitespace (keeps offsets). */
function maskStrings(text: string): string {
  return text
    .replace(/"""[\s\S]*?"""/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'''[\s\S]*?'''/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\])*"/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\])*'/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Replace full IRIs `<...>` with whitespace (so prefix-detection ignores them). */
function maskIRIs(text: string): string {
  return text.replace(/<[^>]*>/g, (m) => ' '.repeat(m.length));
}

const PREDICATE_TOKEN_RE = /^([a-zA-Z][\w-]*:[a-zA-Z_][\w-]*|a|<[^>]+>)$/;

function isPredicateToken(tok: string): boolean {
  return PREDICATE_TOKEN_RE.test(tok);
}

/* ── Check 1: Missing terminators ───────────────────────────────── */

function checkMissingTerminators(turtle: string): TurtleSyntaxError | null {
  const sanitized = maskStrings(stripComments(turtle));
  const lines = sanitized.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].trim();
    if (!cleaned || cleaned.startsWith('@')) continue;

    // Already correctly terminated / opened?
    const last = cleaned.slice(-1);
    if ('.,;[](){}'.includes(last)) continue;

    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue; // bare subject line — OK in Turtle

    if (!isPredicateToken(tokens[0])) continue; // not a predicate-object pair

    // Find next significant line
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) continue;

    const next = lines[j].trim();
    // Acceptable continuations: closing bracket / period
    if (next.startsWith(']') || next.startsWith(')') || next.startsWith('.')) continue;
    // Continuation of an object list / multi-line literal (literal, IRI, number, bnode)
    if (/^["'<\[\(\d_-]/.test(next)) continue;

    if (isPredicateToken(next.split(/\s+/)[0])) {
      return {
        line: i + 1,
        message: `Missing terminator at end of line ${i + 1}`,
        expected: "';' or '.'",
        got: next.split(/\s+/)[0],
        raw: `Line ${i + 1}: ${cleaned}`,
      };
    }
  }
  return null;
}

/* ── Check 2: Undeclared prefixes ────────────────────────────────── */

function checkUndeclaredPrefixes(turtle: string): TurtleSyntaxError | null {
  // Collect declared prefixes (e.g. @prefix sh: <...>)
  const declared = new Set<string>();
  const prefixRe = /@prefix\s+([a-zA-Z][\w-]*)\s*:/g;
  let pm: RegExpExecArray | null;
  while ((pm = prefixRe.exec(turtle)) !== null) declared.add(pm[1]);

  // Mask IRIs + strings so we don't see http:, https:, etc. as prefixes
  const sanitized = maskStrings(maskIRIs(stripComments(turtle)));
  const lines = sanitized.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip @prefix / @base declarations themselves
    if (line.trim().startsWith('@')) continue;

    const usageRe = /\b([a-zA-Z][\w-]*):[a-zA-Z_]/g;
    let um: RegExpExecArray | null;
    while ((um = usageRe.exec(line)) !== null) {
      const pfx = um[1];
      if (declared.has(pfx)) continue;
      // Skip well-known URI schemes (just in case maskIRIs missed something)
      if (['http', 'https', 'ftp', 'mailto', 'urn', 'file'].includes(pfx.toLowerCase())) continue;
      return {
        line: i + 1,
        message: `Undefined prefix '${pfx}:' on line ${i + 1}`,
        undefinedPrefix: pfx + ':',
        raw: `Line ${i + 1}: prefix '${pfx}:' not declared`,
      };
    }
  }
  return null;
}

/* ── Check 3: Unbalanced brackets ───────────────────────────────── */

function checkUnbalancedBrackets(turtle: string): TurtleSyntaxError | null {
  const sanitized = maskStrings(maskIRIs(stripComments(turtle)));
  const lines = sanitized.split('\n');

  let sqDepth = 0, parDepth = 0;
  let lastSqOpenLine = 0, lastParOpenLine = 0;

  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '[') { sqDepth++; lastSqOpenLine = i + 1; }
      else if (ch === ']') {
        sqDepth--;
        if (sqDepth < 0) {
          return {
            line: i + 1,
            message: `Unexpected ']' on line ${i + 1} — no matching '['`,
            got: ']',
            raw: `Unbalanced bracket on line ${i + 1}`,
          };
        }
      } else if (ch === '(') { parDepth++; lastParOpenLine = i + 1; }
      else if (ch === ')') {
        parDepth--;
        if (parDepth < 0) {
          return {
            line: i + 1,
            message: `Unexpected ')' on line ${i + 1} — no matching '('`,
            got: ')',
            raw: `Unbalanced parenthesis on line ${i + 1}`,
          };
        }
      }
    }
  }

  if (sqDepth > 0) {
    return {
      line: lastSqOpenLine,
      message: `Unclosed '[' starting on line ${lastSqOpenLine}`,
      expected: "']'",
      raw: `Missing closing ']' for block on line ${lastSqOpenLine}`,
    };
  }
  if (parDepth > 0) {
    return {
      line: lastParOpenLine,
      message: `Unclosed '(' starting on line ${lastParOpenLine}`,
      expected: "')'",
      raw: `Missing closing ')' for list on line ${lastParOpenLine}`,
    };
  }
  return null;
}

/* ── Public API ─────────────────────────────────────────────────── */

export function validateTurtle(turtle: string): TurtleSyntaxError | null {
  if (!turtle.trim()) return null;
  return (
    checkUndeclaredPrefixes(turtle) ??
    checkUnbalancedBrackets(turtle) ??
    checkMissingTerminators(turtle) ??
    null
  );
}
