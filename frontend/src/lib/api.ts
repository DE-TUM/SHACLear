import type {
  GenerationResult,
  ModelInfo,
  PromptMode,
  StreamDone,
  ValidationResult,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

interface ErrorPayload { detail?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let payload: ErrorPayload = {};
    try { payload = await res.json(); } catch { /* ignore */ }
    throw new Error(payload.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface GenerateBody {
  turtle: string;
  model: string;
  mode: PromptMode;
  reflection: boolean;
}

export interface RefineBody {
  turtle: string;
  previous_output: string;
  instruction: string;
  model: string;
}

export interface StreamCallbacks {
  /** Preprocessed input, delivered once before any text. */
  onPreprocessed?: (text: string) => void;
  /** Incremental explanation text. */
  onDelta: (text: string) => void;
  /** Reflection pass begins — discard text shown so far and start fresh. */
  onReflectStart?: () => void;
  /** Final usage/metadata. */
  onDone: (meta: StreamDone) => void;
  /** Pre-stream (HTTP) or in-stream error. */
  onError: (status: number, message: string) => void;
}

/**
 * Consume an NDJSON stream, dispatching each event to `cb`. Extracted so
 * `/api/generate/stream` and `/api/refine/stream` can share the transport.
 */
async function consumeNdjsonStream(
  path: string,
  body: unknown,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    cb.onError(0, (e as Error).message || 'Network error');
    return;
  }

  if (!res.ok || !res.body) {
    let detail = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as ErrorPayload;
      if (payload.detail) detail = payload.detail;
    } catch { /* non-JSON body */ }
    cb.onError(res.status, detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let ev: { type: string; [k: string]: unknown };
    try {
      ev = JSON.parse(trimmed);
    } catch {
      return; // skip a malformed line rather than aborting the stream
    }
    switch (ev.type) {
      case 'preprocessed': cb.onPreprocessed?.(ev.text as string); break;
      case 'delta': cb.onDelta(ev.text as string); break;
      case 'reflect_start': cb.onReflectStart?.(); break;
      case 'done': cb.onDone(ev as unknown as StreamDone); break;
      case 'error': cb.onError((ev.status as number) ?? 502, ev.message as string); break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    if (buffer) handleLine(buffer); // trailing line without newline
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      cb.onError(0, (e as Error).message || 'Stream interrupted');
    }
  }
}

/**
 * Stream `/api/generate/stream` (NDJSON), dispatching each event to a callback.
 * Resolves once the stream is fully consumed (success or error). Pass `signal`
 * to abort an in-flight stream.
 */
function generateStream(body: GenerateBody, cb: StreamCallbacks, signal?: AbortSignal) {
  return consumeNdjsonStream('/api/generate/stream', body, cb, signal);
}

/**
 * Stream `/api/refine/stream` (NDJSON). Same NDJSON event shape as
 * generateStream; there is no reflection pass, so `onReflectStart` is
 * never invoked.
 */
function refineStream(body: RefineBody, cb: StreamCallbacks, signal?: AbortSignal) {
  return consumeNdjsonStream('/api/refine/stream', body, cb, signal);
}

export const api = {
  models: () => request<{ models: ModelInfo[] }>('/api/models'),

  validate: (turtle: string) =>
    request<ValidationResult>('/api/validate', {
      method: 'POST',
      body: JSON.stringify({ turtle }),
    }),

  generate: (body: GenerateBody) =>
    request<GenerationResult>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  generateStream,

  refine: (body: RefineBody) =>
    request<GenerationResult>('/api/refine', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  refineStream,

  convertRdf: async (file: File): Promise<{ turtle: string; filename: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/convert-rdf`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.detail ?? `Upload failed (${res.status})`);
    }
    return res.json();
  },
};
