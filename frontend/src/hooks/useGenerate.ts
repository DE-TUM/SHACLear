import { useMutation } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { api, type GenerateBody } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { MODE_LABELS, type GenerationResult, type HistoryEntry, type StreamDone } from '@/lib/types';
import { extractErrorLines } from '@/lib/parseErrorLines';
import { humanizeError, humanizeTurtleSyntaxError } from '@/lib/humanizeError';
import { validateTurtle } from '@/lib/validateTurtle';

export const GENERATE_MUTATION_KEY = ['generate'] as const;

/** Sentinel error used when client-side validation fails. */
class TurtleSyntaxClientError extends Error {
  constructor(public readonly line: number, public readonly humanized: { title: string; description?: string }) {
    super(humanized.title);
    this.name = 'TurtleSyntaxClientError';
  }
}

export function useGenerate() {
  const { addEntry, bumpGeneration, setValidationError, setErrorLines } = useAppStore();

  return useMutation({
    mutationKey: [...GENERATE_MUTATION_KEY],
    mutationFn: async (body: GenerateBody): Promise<GenerationResult> => {
      // ── Client-side syntax validation BEFORE the backend roundtrip ──
      const syntaxError = validateTurtle(body.turtle);
      if (syntaxError) {
        const humanized = humanizeTurtleSyntaxError(syntaxError);
        throw new TurtleSyntaxClientError(syntaxError.line, humanized);
      }

      const store = useAppStore.getState();
      store.beginStream();

      let accumulated = '';
      let preprocessed = '';
      let done: StreamDone | null = null;
      let streamError: string | null = null;

      // When reflection is enabled, the backend runs two LLM calls in sequence:
      // a first pass followed by a self-critique pass. Only the final,
      // reflected answer is meant for the user, so we withhold the first
      // pass from the visible stream until we see `reflect_start`. Without
      // this gate, users would briefly see the first (soon-to-be-discarded)
      // answer stream in before it is replaced by the reflected version.
      let showStreamedText = !body.reflection;

      await api.generateStream(body, {
        onPreprocessed: (t) => { preprocessed = t; },
        onDelta: (t) => {
          accumulated += t;
          if (showStreamedText) store.pushStreamDelta(t);
        },
        // Reflection rewrites the answer: drop what we've collected so far
        // and begin showing the reflected pass to the user.
        onReflectStart: () => {
          accumulated = '';
          store.clearStreamText();
          showStreamedText = true;
        },
        onDone: (meta) => { done = meta; },
        onError: (_status, message) => { streamError = message; },
      });

      if (streamError) throw new Error(streamError);
      if (!done) throw new Error('The model stream ended unexpectedly. Please try again.');

      const meta = done as StreamDone;
      return {
        explanation: accumulated,
        preprocessed: meta.preprocessed || preprocessed,
        tokens: meta.tokens,
        cost: meta.cost,
        elapsed_s: meta.elapsed_s,
        model: meta.model,
        mode: meta.mode,
      };
    },
    onMutate: () => {
      setValidationError(null);
      setErrorLines([]);
      toast.loading('Generating explanation…', { id: 'generate', description: undefined });
    },
    onSuccess: (result, vars) => {
      const state = useAppStore.getState();
      const isUpload = state.selectedTab === 'upload';
      const entry: HistoryEntry = {
        ...result,
        id: nanoid(),
        model: vars.model, // friendly key, not OpenRouter ID
        input: vars.turtle,
        source: isUpload ? 'upload' : 'text',
        filename: isUpload ? state.uploadedFile?.name : undefined,
        mode_label: MODE_LABELS[vars.mode],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        generation: bumpGeneration(),
        refined: false,
      };
      // Commit the entry, THEN leave streaming mode — doing it in this order
      // means currentResult is already populated when the streamed text clears,
      // so the output never flashes back to the loading skeleton.
      addEntry(entry);
      useAppStore.getState().endStream();
      toast.success(`Explanation ready · ${result.elapsed_s}s · ${result.tokens} tokens`, {
        id: 'generate',
        description: undefined,
      });
    },
    onError: (err: Error) => {
      useAppStore.getState().endStream();
      let title: string;
      let description: string | undefined;
      let lines: number[];

      if (err instanceof TurtleSyntaxClientError) {
        // Exact line + already-humanized message from n3
        title = err.humanized.title;
        description = err.humanized.description;
        lines = [err.line];
      } else {
        // Backend error string
        lines = extractErrorLines(err.message);
        const h = humanizeError(err.message);
        title = h.title;
        description = h.description;
      }

      setValidationError(description ? `${title}. ${description}` : title);
      setErrorLines(lines);
      toast.error(title, {
        id: 'generate',
        description,
        duration: 10_000,
        onDismiss: () => useAppStore.getState().setErrorLines([]),
        onAutoClose: () => useAppStore.getState().setErrorLines([]),
      });
    },
  });
}
