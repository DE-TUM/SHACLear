import { useMutation } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { api, type RefineBody } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import type { HistoryEntry, StreamDone } from '@/lib/types';

export const REFINE_MUTATION_KEY = ['refine'] as const;

export function useRefine() {
  const { addEntry, currentResult } = useAppStore();

  return useMutation({
    mutationKey: [...REFINE_MUTATION_KEY],
    mutationFn: async (body: RefineBody) => {
      const store = useAppStore.getState();
      store.beginStream();

      let accumulated = '';
      let refinementStage = '';
      let done: StreamDone | null = null;
      let streamError: string | null = null;

      await api.refineStream(body, {
        onPreprocessed: (t) => { refinementStage = t; },
        onDelta: (t) => { accumulated += t; store.pushStreamDelta(t); },
        onDone: (meta) => { done = meta; },
        onError: (_status, message) => { streamError = message; },
      });

      if (streamError) throw new Error(streamError);
      if (!done) throw new Error('The refinement stream ended unexpectedly. Please try again.');

      const meta = done as StreamDone;
      return {
        explanation: accumulated,
        // Backend returns just the refinement pass; the frontend appends it
        // to the previous preprocessed block in onSuccess below.
        preprocessed: meta.preprocessed || refinementStage,
        tokens: meta.tokens,
        cost: meta.cost,
        elapsed_s: meta.elapsed_s,
        model: meta.model,
        mode: meta.mode,
      };
    },
    onMutate: () => toast.loading('Refining explanation…', { id: 'refine', description: undefined }),
    onSuccess: (result, vars) => {
      if (!currentResult) return;
      const entry: HistoryEntry = {
        ...result,
        id: nanoid(),
        model: vars.model, // friendly key
        input: currentResult.input,
        source: currentResult.source,
        filename: currentResult.filename,
        mode_label: currentResult.mode_label,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        generation: currentResult.generation,
        refined: true,
        refine_instruction: vars.instruction,
        // Append the refinement's user prompt (returned by the backend) to
        // the previous preprocessed block so the accordion shows the full
        // conversation: original generation prompt → refinement prompt.
        preprocessed: result.preprocessed
          ? `${currentResult.preprocessed}\n\n${result.preprocessed}`
          : currentResult.preprocessed,
        tokens: currentResult.tokens + result.tokens,
        cost: currentResult.cost + result.cost,
      };
      addEntry(entry);
      useAppStore.getState().endStream();
      toast.success('Explanation refined', { id: 'refine', description: undefined });
    },
    onError: (err: Error) => {
      useAppStore.getState().endStream();
      toast.error(err.message, { id: 'refine' });
    },
  });
}
