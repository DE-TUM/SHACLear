import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { validateTurtle } from '@/lib/validateTurtle';
import { humanizeError, humanizeTurtleSyntaxError } from '@/lib/humanizeError';
import type { GenerationResult, PromptMode } from '@/lib/types';

export interface CompareParams {
  turtle: string;
  mode: PromptMode;
  models: string[];
  /** Bumped to (re-)trigger a run; nothing fires while 0. */
  runId: number;
}

export interface CompareColumn {
  model: string;
  isLoading: boolean;
  /** Text accumulated so far while the model streams. */
  streamText: string;
  result?: GenerationResult;
  error?: string;
}

/** Immutably patch column `i` of the array. */
function patch(cols: CompareColumn[], i: number, p: Partial<CompareColumn>): CompareColumn[] {
  return cols.map((c, idx) => (idx === i ? { ...c, ...p } : c));
}

/**
 * Stream `/api/generate/stream` across the selected models in parallel. Each
 * model runs independently, so one failing (or a slow free model) never blocks
 * the others — columns fill in progressively as text arrives.
 */
export function useCompare({ turtle, mode, models, runId }: CompareParams): CompareColumn[] {
  const [columns, setColumns] = useState<CompareColumn[]>([]);

  // Re-run only when "Compare" is pressed (runId bumps), NOT on every keystroke
  // in the editor — otherwise editing after a run would silently re-fire calls.
  useEffect(() => {
    if (runId <= 0 || turtle.trim().length === 0 || models.length === 0) return;

    setColumns(models.map((model) => ({ model, isLoading: true, streamText: '' })));

    const syntaxError = validateTurtle(turtle);
    const controllers = models.map(() => new AbortController());

    models.forEach((model, i) => {
      if (syntaxError) {
        setColumns((cols) =>
          patch(cols, i, { isLoading: false, error: humanizeTurtleSyntaxError(syntaxError).title }),
        );
        return;
      }

      let acc = '';
      void api.generateStream(
        { turtle, model, mode, reflection: false },
        {
          onDelta: (t) => {
            acc += t;
            setColumns((cols) => patch(cols, i, { streamText: acc }));
          },
          onDone: (meta) => {
            setColumns((cols) =>
              patch(cols, i, {
                isLoading: false,
                result: {
                  explanation: acc,
                  preprocessed: meta.preprocessed,
                  tokens: meta.tokens,
                  cost: meta.cost,
                  elapsed_s: meta.elapsed_s,
                  model: meta.model,
                  mode: meta.mode,
                },
              }),
            );
          },
          onError: (_status, message) => {
            setColumns((cols) =>
              patch(cols, i, { isLoading: false, error: humanizeError(message).title }),
            );
          },
        },
        controllers[i].signal,
      );
    });

    return () => controllers.forEach((c) => c.abort());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return columns;
}
