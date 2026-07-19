import { Coins, Zap, Crown } from 'lucide-react';

export interface Winners {
  cost?: string;
  perf?: string;
  tokens?: string;
}

export function ComparisonSummary({ winners }: { winners: Winners }) {
  const items = [
    { icon: Coins, label: 'Cheapest', model: winners.cost },
    { icon: Zap, label: 'Fastest', model: winners.perf },
    { icon: Crown, label: 'Fewest tokens', model: winners.tokens },
  ].filter((i) => i.model);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-[0.68rem] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Best in class
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {items.map(({ icon: Icon, label, model }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-300"
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-brand-500 dark:text-brand-400">{label}:</span>
            <span className="font-semibold">{model}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
