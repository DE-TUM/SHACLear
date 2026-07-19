import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '@/lib/types';
import { costLabel } from '@/lib/cost';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/ui/CountUp';

interface CardProps {
  label: string;
  /** Raw value to count up to. */
  count: number;
  format: (v: number) => string;
  sub: string;
  accent: string;
  hint?: string;
  index: number;
}

function MetricCard({ label, count, format, sub, accent, hint, index }: CardProps) {
  return (
    <div
      className="reveal-up card-lift card-lift-hover group relative overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      style={{ animationDelay: `${index * 80}ms` }}
      title={hint}
    >
      <div className={cn('absolute top-0 inset-x-0 h-[3px] rounded-t-lg', accent)} />
      <div className="text-[0.68rem] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
        {label}
      </div>
      <div className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
        <CountUp value={count} format={format} />
      </div>
      <div className="text-[0.7rem] font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

/** Placeholder row shown while a generation is in flight — keeps the column from collapsing. */
export function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {['Cost', 'Tokens', 'Performance'].map((label, i) => (
        <div
          key={label}
          className="reveal-up relative overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="absolute top-0 inset-x-0 h-[3px] rounded-t-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="text-[0.68rem] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
            {label}
          </div>
          <div className="loading-pulse h-5 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="loading-pulse mt-1.5 h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
      ))}
    </div>
  );
}

/** One skeleton cell, matching MetricCardsSkeleton's styling. */
function SkeletonCard({ label, index }: { label: string; index: number }) {
  return (
    <div
      className="reveal-up relative overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="absolute top-0 inset-x-0 h-[3px] rounded-t-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="text-[0.68rem] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
        {label}
      </div>
      <div className="loading-pulse h-5 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="loading-pulse mt-1.5 h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800/60" />
    </div>
  );
}

/**
 * Metric row shown while streaming: Cost and Tokens can't be known until the
 * final usage chunk, so they stay skeletons; Performance ticks as a live timer.
 */
export function MetricCardsStreaming() {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - start.current) / 1000), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="grid grid-cols-3 gap-3">
      <SkeletonCard label="Cost" index={0} />
      <SkeletonCard label="Tokens" index={1} />
      <div
        className="reveal-up relative overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        style={{ animationDelay: '160ms' }}
      >
        <div className="absolute top-0 inset-x-0 h-[3px] rounded-t-lg bg-blue-500" />
        <div className="text-[0.68rem] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
          Performance
        </div>
        <div className="text-lg font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100">
          {elapsed.toFixed(1)}s
        </div>
        <div className="text-[0.7rem] font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">streaming…</div>
      </div>
    </div>
  );
}

export function MetricCards({ result }: { result: HistoryEntry }) {
  const cost = costLabel(result.cost);
  return (
    <div className="grid grid-cols-3 gap-3">
      <MetricCard
        index={0}
        label="Cost"
        count={result.cost}
        format={(v) => costLabel(v).value}
        sub={cost.tier}
        accent={cost.color}
        hint="Estimated cost based on OpenRouter pricing"
      />
      <MetricCard
        index={1}
        label="Tokens"
        count={result.tokens}
        format={(v) => String(Math.round(v))}
        sub="prompt + completion"
        accent="bg-blue-500"
        hint="Total prompt + completion tokens"
      />
      <MetricCard
        index={2}
        label="Performance"
        count={result.elapsed_s}
        format={(v) => `${parseFloat(v.toFixed(2))}s`}
        sub="response time"
        accent="bg-blue-500"
        hint="Total response time"
      />
    </div>
  );
}
