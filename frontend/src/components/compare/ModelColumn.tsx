import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, AlertCircle, Crown, Zap, Coins, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { renderMarkdown } from '@/lib/markdown';
import { costLabel } from '@/lib/cost';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/ui/CountUp';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';
import type { CompareColumn } from '@/hooks/useCompare';

export interface ColumnWinners {
  cost?: boolean;
  perf?: boolean;
  tokens?: boolean;
}

export function ModelColumn({
  col, winners, index = 0,
}: {
  col: CompareColumn;
  winners: ColumnWinners;
  index?: number;
}) {
  return (
    <div
      className="reveal-up card-lift card-lift-hover flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="flex items-center gap-2">
        <h3 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{col.model}</h3>
        {col.isLoading && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-brand-600 dark:text-brand-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
            generating…
          </span>
        )}
      </div>

      {col.result && <Metrics col={col} winners={winners} />}
      {col.result && <Explanation text={col.result.explanation} />}
      {/* Streaming: show partial text once it starts, skeleton until then. */}
      {col.isLoading && (col.streamText ? <Explanation text={col.streamText} streaming /> : <LoadingBody />)}
      {col.error && !col.isLoading && <ErrorBody message={col.error} />}
    </div>
  );
}

function Metrics({ col, winners }: { col: CompareColumn; winners: ColumnWinners }) {
  const r = col.result!;
  const cost = costLabel(r.cost);
  return (
    <div className="grid grid-cols-3 gap-2">
      <MiniMetric label="Cost" count={r.cost} format={(v) => costLabel(v).value} accent={cost.color} win={winners.cost} icon={Coins} />
      <MiniMetric label="Tokens" count={r.tokens} format={(v) => String(Math.round(v))} accent="bg-blue-500" win={winners.tokens} icon={Crown} />
      <MiniMetric label="Time" count={r.elapsed_s} format={(v) => `${parseFloat(v.toFixed(2))}s`} accent="bg-blue-500" win={winners.perf} icon={Zap} />
    </div>
  );
}

function MiniMetric({
  label, count, format, accent, win, icon: Icon,
}: {
  label: string;
  count: number;
  format: (v: number) => string;
  accent: string;
  win?: boolean;
  icon: typeof Crown;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-white px-2.5 py-2 dark:bg-zinc-900',
        win
          ? 'border-brand-400 ring-1 ring-brand-400/50 dark:border-brand-500'
          : 'border-zinc-200 dark:border-zinc-800',
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-[2px]', win ? 'bg-brand-500' : accent)} />
      <div className="flex items-center gap-1">
        <span className="text-[0.6rem] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {win && <Icon className="h-3 w-3 text-brand-500" />}
      </div>
      <div className="mt-0.5 truncate text-sm font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
        <CountUp value={count} format={format} />
      </div>
    </div>
  );
}

function Explanation({ text, streaming }: { text: string; streaming?: boolean }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  const [copied, setCopied] = useState(false);
  const setHoveredRef = useAppStore((s) => s.setHoveredRef);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };
  // Bidirectional hover-to-link — same delegation pattern as ExplanationBox
  // so every column in compare view drives the SAME Turtle editor highlight.
  // Setting the ref on every pointerover (null when not on a paragraph)
  // means moving into the padding gutter clears the highlight instead of
  // leaving it stuck on the previously-hovered paragraph.
  const onPointerOver = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-ref]');
    const ref = el?.getAttribute('data-ref') ?? null;
    setHoveredRef(ref);
  };
  const onPointerLeave = () => setHoveredRef(null);
  useEffect(() => () => setHoveredRef(null), [setHoveredRef]);
  return (
    <div className="relative rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/40">
      {/* Info icon — top-left, isolated from the Copy button on the right. */}
      <div className="absolute left-1.5 top-1.5 z-10">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About the hover-to-highlight feature"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-brand-500 hover:bg-brand-50 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-brand-500/20 dark:hover:text-brand-100 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              Hover a paragraph to highlight the matching SHACL lines on the left.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* No copy button mid-stream — the text is still changing. */}
      {!streaming && (
        <button
          onClick={onCopy}
          aria-label="Copy explanation"
          title="Copy explanation"
          className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
      <div
        className="explanation-body px-4 pt-10 pb-3.5 pr-9 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200"
        onPointerOver={onPointerOver}
        onPointerLeave={onPointerLeave}
      >
        <span dangerouslySetInnerHTML={{ __html: html }} />
        {streaming && (
          <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-brand-500 align-middle" />
        )}
      </div>
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="loading-pulse h-3 rounded bg-zinc-200 dark:bg-zinc-800"
          style={{ width: ['90%', '100%', '70%'][i], animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

function ErrorBody({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
