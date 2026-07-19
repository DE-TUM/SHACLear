/**
 * Translate raw backend / parser error messages into user-friendly
 * { title, description } pairs suitable for a Sonner toast.
 *
 * Falls back to a softened version of the original message for anything
 * we don't recognise — so we never lose information.
 */
import { extractRawErrorLines, softenLineNumbers } from './parseErrorLines';
import type { TurtleSyntaxError } from './validateTurtle';

export interface HumanizedError {
  title: string;
  description?: string;
}

/* ── Direct n3 path (client-side) ────────────────────────────────── */

/** Convert a TurtleSyntaxError (from n3) directly to a humanized toast. */
export function humanizeTurtleSyntaxError(err: TurtleSyntaxError): HumanizedError {
  // Undefined prefix is unambiguous and high-signal
  if (err.undefinedPrefix) {
    return {
      title: `Undefined prefix '${err.undefinedPrefix}'`,
      description: `Add @prefix ${err.undefinedPrefix} <...> . at the top of the file.`,
    };
  }

  // n3 tells us exactly what was found vs. expected
  if (err.expected && err.got) {
    return {
      title: `Syntax error on line ${err.line}`,
      description: `Expected ${err.expected} but found ${err.got}. Common fix: add the missing terminator (\`;\` between rules, \`]\` to close a block, or \`.\` to end the statement).`,
    };
  }

  if (err.got) {
    return {
      title: `Unexpected '${err.got}' on line ${err.line}`,
      description: 'Check that the previous rule ends with a `;`, `]`, or `.`.',
    };
  }

  return {
    title: `Syntax error on line ${err.line}`,
    description: err.message,
  };
}

/* ── Helpers for raw-string flow (backend errors) ────────────────── */

function formatLineRange(message: string): string | null {
  const raw = extractRawErrorLines(message);
  if (raw.length === 0) return null;
  const n = raw[0];
  return `line ${n}`;
}

/* ── Main API (for backend error strings) ────────────────────────── */

export function humanizeError(rawMessage: string): HumanizedError {
  const message = rawMessage ?? '';

  // ── 1. Turtle syntax errors from backend (rare now — most are caught client-side)
  if (/Invalid Turtle syntax/i.test(message)) {
    const lineRange = formatLineRange(message);
    return {
      title: 'Syntax error in your SHACL shape',
      description: lineRange
        ? `Check ${lineRange}. Common causes: missing semicolon \`;\` between rules, missing \`]\` to close a block, or missing \`.\` at the end.`
        : 'Check brackets, semicolons and periods.',
    };
  }

  // ── 2. SHACL structural errors ───────────────────────────────────
  if (/Invalid SHACL structure/i.test(message)) {
    return {
      title: 'Valid Turtle, but not a valid SHACL shape',
      description: 'The syntax parses, but the document does not define a valid SHACL shape.',
    };
  }

  // ── 3. LLM-related errors ───────────────────────────────────────
  if (/invalid api key/i.test(message)) {
    return {
      title: 'Invalid API key',
      description: 'Check your OPENROUTER_API_KEY in backend/.env.',
    };
  }
  if (/insufficient credits/i.test(message)) {
    return {
      title: 'Insufficient OpenRouter credits',
      description: 'Top up your OpenRouter account to continue.',
    };
  }
  if (/rate limit/i.test(message)) {
    return {
      title: 'Rate limit exceeded',
      description: 'Please wait a moment before trying again.',
    };
  }
  if (/prompt too long/i.test(message)) {
    return {
      title: 'Prompt too long for this model',
      description: 'Try a shorter SHACL shape or switch to Mode A (Structured).',
    };
  }
  if (/timed out/i.test(message)) {
    return {
      title: 'Model timed out',
      description: 'The model took too long to respond. Try again or pick a different model.',
    };
  }
  if (/model .+ not found/i.test(message)) {
    return {
      title: 'Model not available',
      description: 'The selected model may have been renamed or removed on OpenRouter.',
    };
  }
  if (/server error/i.test(message)) {
    return {
      title: 'OpenRouter server error',
      description: "Something went wrong on OpenRouter's side. Please try again.",
    };
  }

  // ── 4. File upload ───────────────────────────────────────────────
  if (/not valid utf-?8/i.test(message)) {
    return {
      title: 'File is not readable as text',
      description: 'The upload looks like a binary file or uses a non-UTF-8 encoding. Please upload a UTF-8 encoded .ttl or .rdf file.',
    };
  }
  if (/could not parse file/i.test(message)) {
    // Try to surface a more specific cause from the underlying parser
    const xmlHint = /xml|expat|syntax|tag|element/i.test(message);
    return {
      title: xmlHint
        ? 'Could not parse the RDF/XML file'
        : 'Could not parse the uploaded file',
      description: xmlHint
        ? 'The XML is malformed. Check for unclosed tags, invalid characters, or missing namespace declarations.'
        : 'Make sure it is valid Turtle (.ttl) or RDF/XML (.rdf).',
    };
  }
  if (/invalid shacl shape/i.test(message)) {
    return {
      title: 'Invalid SHACL shape in file',
      description: softenLineNumbers(
        message.replace(/^Invalid SHACL shape:\s*/i, ''),
      ),
    };
  }

  // ── 5. Fallback ─────────────────────────────────────────────────
  return {
    title: 'Something went wrong',
    description: softenLineNumbers(message),
  };
}
