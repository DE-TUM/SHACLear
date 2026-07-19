import { useMemo } from 'react';
import { History } from 'lucide-react';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import type { HistoryEntry, PromptMode } from '@/lib/types';

export function RevisionHistory() {
  const {
    history,
    currentResult,
    setCurrent,
    setInputText,
    setUploadedFile,
    setSelectedTab,
    setModel,
    setMode,
  } = useAppStore();

  /** Restore the full input + settings context that produced this entry. */
  const loadEntry = (e: HistoryEntry) => {
    setCurrent(e);

    if (e.source === 'upload' && e.filename) {
      setUploadedFile({ name: e.filename, turtle: e.input });
      setSelectedTab('upload');
    } else {
      setInputText(e.input);
      setUploadedFile(null);
      setSelectedTab('text');
    }

    // Restore the generation settings so the user sees the full context
    setModel(e.model);
    // e.mode is "a" | "b" | "c" | "refine" — only restore for actual modes
    if (e.mode === 'a' || e.mode === 'b' || e.mode === 'c') {
      setMode(e.mode as PromptMode);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<number, HistoryEntry[]>();
    history.forEach((e) => {
      const arr = map.get(e.generation) ?? [];
      arr.push(e);
      map.set(e.generation, arr);
    });
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [history]);

  const isCompareGen = (entries: HistoryEntry[]) => entries.length > 1 && entries.every((e) => e.compare);

  if (history.length === 0) return null;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="hist">
        <AccordionTrigger>
          <span className="flex flex-1 items-center justify-between pr-2">
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" /> Revision History
            </span>
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-zinc-100 px-1.5 text-[0.65rem] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {history.length}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3 max-h-[24rem] overflow-y-auto pr-1">
            {grouped.map(([gen, entries]) => (
              <div key={gen}>
                <div className="text-[0.7rem] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 first:border-t-0 first:pt-0">
                  Generation #{gen}
                  {isCompareGen(entries) && (
                    <span className="ml-1.5 normal-case tracking-normal text-brand-500 dark:text-brand-400">
                      ⚖ compare · {entries.length} models
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {entries.map((e) => {
                    const isCur = e.id === currentResult?.id;
                    const sourceTag = e.source === 'upload' ? '📄' : '✍️';
                    const label = e.refined && e.refine_instruction
                      ? `✏️ "${e.refine_instruction}" · ${e.time}`
                      : `${sourceTag} ${e.model} · ${e.mode_label.split('–')[0].trim()} · ${e.time}`;
                    return (
                      <li
                        key={e.id}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3 h-10',
                          isCur
                            ? 'bg-brand-50 border-brand-200 dark:bg-brand-900/30 dark:border-brand-700'
                            : 'bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800',
                        )}
                      >
                        <span className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          isCur ? 'bg-brand-700 dark:bg-brand-400' : 'bg-zinc-300 dark:bg-zinc-600',
                        )} />
                        <span className={cn(
                          'flex-1 text-xs truncate',
                          isCur
                            ? 'font-semibold text-brand-900 dark:text-brand-100'
                            : 'text-zinc-600 dark:text-zinc-300',
                        )}>
                          {label}
                        </span>
                        {!isCur && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => loadEntry(e)}
                          >
                            Load
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
