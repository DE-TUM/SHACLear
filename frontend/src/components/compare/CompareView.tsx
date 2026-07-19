import { useCallback, useEffect, useRef, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { TurtleEditor } from '@/components/input/TurtleEditor';
import { FileUploadCard } from '@/components/input/FileUploadCard';
// Kept as a comment for the demo build; see the render section below.
// import { PromptModeSelector } from '@/components/input/PromptModeSelector';
import { MultiModelSelector } from './MultiModelSelector';
import { ModelColumn } from './ModelColumn';
import { ComparisonSummary, type Winners } from './ComparisonSummary';
import { useAppStore } from '@/store/useAppStore';
import { useCompare, type CompareColumn } from '@/hooks/useCompare';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { validateTurtle } from '@/lib/validateTurtle';
import { humanizeTurtleSyntaxError } from '@/lib/humanizeError';
import { MODE_LABELS, type HistoryEntry } from '@/lib/types';

export function CompareView() {
  const {
    inputText, uploadedFile, selectedTab, setSelectedTab, compareModels,
    bumpGeneration, addCompareEntries,
  } = useAppStore();
  const [runId, setRunId] = useState(0);

  // Demo build ships only Mode C (raw Turtle baseline). Hard-coded here so a
  // persisted mode='a'/'b' in localStorage cannot leak in.
  const mode = 'c' as const;

  const turtle = selectedTab === 'upload' ? uploadedFile?.turtle ?? '' : inputText;
  const columns = useCompare({ turtle, mode, models: compareModels, runId });

  // Once a compare run has settled (no column still loading), snapshot the
  // successful columns into Revision History as N entries sharing ONE generation.
  // Committed once per runId so progressive reveals don't double-record.
  const committedRunRef = useRef(0);
  useEffect(() => {
    if (runId === 0 || runId === committedRunRef.current) return;
    if (columns.length === 0 || columns.some((c) => c.isLoading)) return;

    committedRunRef.current = runId;
    const done = columns.filter((c) => c.result);
    if (done.length === 0) return; // whole run failed — nothing worth recording

    const generation = bumpGeneration();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isUpload = selectedTab === 'upload';
    const entries: HistoryEntry[] = done.map((c) => ({
      ...c.result!,
      id: nanoid(),
      model: c.model,
      input: turtle,
      source: isUpload ? 'upload' : 'text',
      filename: isUpload ? uploadedFile?.name : undefined,
      mode_label: MODE_LABELS[mode],
      time,
      generation,
      refined: false,
      compare: true,
    }));
    addCompareEntries(entries);
  }, [runId, columns, turtle, mode, selectedTab, uploadedFile, bumpGeneration, addCompareEntries]);

  const canCompare = turtle.trim().length > 0 && compareModels.length >= 2;
  const anyLoading = columns.some((c) => c.isLoading);

  const onCompare = useCallback(() => {
    if (!canCompare) return;
    const syntaxError = validateTurtle(turtle);
    if (syntaxError) {
      toast.error(humanizeTurtleSyntaxError(syntaxError).title);
      return;
    }
    setRunId((n) => n + 1);
  }, [canCompare, turtle]);

  useKeyboardShortcuts([{ key: 'enter', cmd: true, handler: onCompare, allowInInput: true }]);

  const winners = computeWinners(columns);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Input + controls ─────────────────────────────────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <Tabs
            value={selectedTab}
            onValueChange={(v) => setSelectedTab(v as 'text' | 'upload')}
            className="flex flex-col gap-4"
          >
            <div className="flex min-h-[2.25rem] items-center justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Input</h2>
              <TabsList>
                <TabsTrigger value="text">Plain Turtle</TabsTrigger>
                <TabsTrigger value="upload">Upload File</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="text" className="mt-0"><TurtleEditor /></TabsContent>
            <TabsContent value="upload" className="mt-0"><FileUploadCard /></TabsContent>
          </Tabs>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex min-h-[2.25rem] items-center">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Compare</h2>
          </div>
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 card-lift dark:border-zinc-800 dark:bg-zinc-900">
            <MultiModelSelector />
            {/*
              Mode selector removed from the demo build — this branch ships only
              the Mode C (raw Turtle baseline) prompting strategy. Kept as a
              comment so it can be re-enabled later.
              <div className="max-w-[15rem]"><PromptModeSelector /></div>
            */}
            <Button
              onClick={onCompare}
              disabled={!canCompare || anyLoading}
              variant="primary"
              size="lg"
              className="w-full shadow-lg shadow-brand-600/20"
            >
              {anyLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  Comparing…
                </span>
              ) : (
                <>
                  <GitCompare className="mr-2 h-4 w-4" />
                  {compareModels.length >= 2
                    ? `Compare ${compareModels.length} models`
                    : 'Pick at least 2 models'}
                </>
              )}
            </Button>
          </div>
        </section>
      </div>

      {/* ── Results ──────────────────────────────────────────────── */}
      {runId > 0 ? (
        <section className="flex flex-col gap-4">
          <ComparisonSummary winners={winners} />
          <div className={gridClass(columns.length)}>
            {columns.map((col, i) => (
              <ModelColumn
                key={col.model}
                col={col}
                index={i}
                winners={{
                  cost: winners.cost === col.model,
                  perf: winners.perf === col.model,
                  tokens: winners.tokens === col.model,
                }}
              />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

/** Responsive column count that balances to the number of models (stacks on mobile). */
function gridClass(n: number): string {
  if (n >= 3) return 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  if (n === 2) return 'grid gap-4 grid-cols-1 lg:grid-cols-2';
  return 'grid gap-4 grid-cols-1';
}

function computeWinners(columns: CompareColumn[]): Winners {
  const done = columns.filter((c) => c.result);
  if (done.length < 2) return {};
  const min = (sel: (c: CompareColumn) => number) =>
    done.reduce((best, c) => (sel(c) < sel(best) ? c : best)).model;
  return {
    cost: min((c) => c.result!.cost),
    perf: min((c) => c.result!.elapsed_s),
    tokens: min((c) => c.result!.tokens),
  };
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        <GitCompare className="h-6 w-6" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
        Compare models side by side
      </h3>
      <p className="mx-auto max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
        Add a SHACL shape, pick 2–3 models, and run them on the same prompt to compare quality, cost,
        and speed.
      </p>
    </div>
  );
}
