/**
 * Helpers for extracting and rewriting line numbers in backend error messages.
 *
 * Why ranges instead of exact lines?
 *   RDFLib / Turtle parsers are bottom-up: they report the line where the
 *   unexpected token was found, which is often ONE LINE AFTER the actual
 *   error (e.g., a missing semicolon on the previous line).
 *
 *   We therefore expand a reported "line N" into the pair "N-1 .. N" for
 *   both the visual editor highlight and the human-readable message.
 */

const LINE_PATTERN = /(?:at\s+)?line[:\s]+(\d+)/gi;

/** Return the raw line numbers exactly as reported in the message. */
export function extractRawErrorLines(message: string): number[] {
  if (!message) return [];
  const found = new Set<number>();
  LINE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINE_PATTERN.exec(message)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Return line numbers to highlight in the editor.
 *
 * For client-side n3 errors, the line is already exact and we use it as-is.
 * For backend errors (rare since most are caught client-side now), the line
 * is also used as-is to avoid noisy false positives. If a user encounters a
 * persistent off-by-one issue from a backend error, they'll see ONE wrong
 * line, which is better than highlighting TWO lines (one wrong by definition).
 */
export function extractErrorLines(message: string): number[] {
  return extractRawErrorLines(message);
}

/**
 * Rewrite "at line N" / "line N" mentions to a range
 * "near line N-1–N" — same heuristic as extractErrorLines.
 */
export function softenLineNumbers(message: string): string {
  if (!message) return message;
  return message.replace(LINE_PATTERN, (match, num) => {
    const n = parseInt(num, 10);
    if (!Number.isFinite(n) || n <= 0) return match;
    if (n === 1) return `near line ${n}`;
    return `near line ${n - 1}–${n}`;
  });
}
