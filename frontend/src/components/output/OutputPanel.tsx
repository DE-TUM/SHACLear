import { useIsMutating } from '@tanstack/react-query';
import { useAppStore } from '@/store/useAppStore';
import { GENERATE_MUTATION_KEY } from '@/hooks/useGenerate';
import { REFINE_MUTATION_KEY } from '@/hooks/useRefine';
import { ExplanationBox } from './ExplanationBox';
import { MetricCards, MetricCardsSkeleton, MetricCardsStreaming } from './MetricCards';
import { RefineSection } from './RefineSection';
import { PreprocessedView } from './PreprocessedView';
import { RevisionHistory } from './RevisionHistory';
import type { HistoryEntry } from '@/lib/types';

export function OutputPanel() {
  const { currentResult, streaming, streamText } = useAppStore();
  const generating = useIsMutating({ mutationKey: [...GENERATE_MUTATION_KEY] }) > 0;
  const refining = useIsMutating({ mutationKey: [...REFINE_MUTATION_KEY] }) > 0;
  const isLoading = generating || refining;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex min-h-[2.25rem] items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Output</h2>
        {currentResult && !isLoading && <ResultContextChip result={currentResult} />}
      </div>

      {isLoading
        // While streaming, only the live elapsed timer ticks; cost/tokens stay
        // skeletons until the final usage chunk arrives.
        ? (streaming ? <MetricCardsStreaming /> : <MetricCardsSkeleton />)
        : currentResult && <MetricCards key={currentResult.id} result={currentResult} />}

      <ExplanationBox
        text={streaming ? streamText : currentResult?.explanation ?? ''}
        isLoading={isLoading}
        isStreaming={streaming}
      />

      {currentResult && !isLoading && (
        <div className="flex flex-col gap-2">
          <RefineSection />
          <RevisionHistory />
          <PreprocessedView text={currentResult.preprocessed} />
        </div>
      )}

      {!currentResult && !isLoading && <RevisionHistory />}
    </section>
  );
}

/** Compact "model · mode" context shown beside the Output heading, aligned with the input tabs. */
function ResultContextChip({ result }: { result: HistoryEntry }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
      {result.model} · {result.mode_label.split('–')[0].trim()}
    </span>
  );
}
