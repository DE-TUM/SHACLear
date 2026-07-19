import { FileText, GitCompare } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'single' as const, label: 'One Model', icon: FileText },
  { value: 'compare' as const, label: 'Multiple Models', icon: GitCompare },
];

export function ViewToggle() {
  const { viewMode, setViewMode, compareModels, model, toggleCompareModel } = useAppStore();

  const select = (v: 'single' | 'compare') => {
    // Seed the compare set with the current model so the user starts somewhere.
    if (v === 'compare' && compareModels.length === 0) toggleCompareModel(model);
    setViewMode(v);
  };

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100/70 p-0.5 dark:border-zinc-800 dark:bg-zinc-900/70"
    >
      {TABS.map(({ value, label, icon: Icon }) => {
        const active = viewMode === value;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={active}
            onClick={() => select(value)}
            className={cn(
              // `min-w-[150px]` + `justify-center` ensure both buttons have
              // the SAME width (otherwise "One Model" would be narrower than
              // "Multiple Models" and the separator wouldn't sit at the
              // toggle's centre — and therefore not align with the Input/
              // Output column gap below).
              'inline-flex min-w-[150px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
