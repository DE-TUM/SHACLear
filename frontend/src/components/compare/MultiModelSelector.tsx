import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger,
} from '@/components/ui/Select';
import { useModels } from '@/hooks/useModels';
import { useAppStore } from '@/store/useAppStore';
import { modelAvgPrice, modelTier } from '@/lib/cost';
import { groupByVendor } from '@/lib/models';
import { cn } from '@/lib/utils';

const MAX_MODELS = 3;

export function MultiModelSelector() {
  const { compareModels, toggleCompareModel } = useAppStore();
  const { data, isLoading } = useModels();

  const sortedModels = useMemo(() => {
    if (!data?.models) return [];
    return [...data.models].sort((a, b) => modelAvgPrice(a) - modelAvgPrice(b));
  }, [data?.models]);

  const available = sortedModels.filter((m) => !compareModels.includes(m.key));
  const availableGroups = useMemo(() => groupByVendor(available), [available]);
  const full = compareModels.length >= MAX_MODELS;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Models to compare
        </label>
        <span className="text-[0.7rem] font-medium text-zinc-400 dark:text-zinc-500">
          {compareModels.length}/{MAX_MODELS}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {compareModels.map((key) => {
          const m = sortedModels.find((x) => x.key === key);
          const tier = m ? modelTier(modelAvgPrice(m)) : null;
          return (
            <span
              key={key}
              className="chip-in inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-1 pl-2.5 pr-1 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {tier && <span className={cn('h-2 w-2 rounded-full', tierDot(tier.tier))} />}
              {key}
              <button
                type="button"
                onClick={() => toggleCompareModel(key)}
                aria-label={`Remove ${key}`}
                className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}

        {!full && (
          <Select value="" onValueChange={toggleCompareModel} disabled={isLoading}>
            <SelectTrigger
              className="h-8 w-auto gap-1.5 rounded-full border-dashed px-3 text-sm text-zinc-500 dark:text-zinc-400"
              aria-label="Add a model to compare"
            >
              <Plus className="h-3.5 w-3.5" />
              {compareModels.length === 0 ? 'Add models' : 'Add'}
            </SelectTrigger>
            <SelectContent>
              {availableGroups.map(({ vendor, models }) => (
                <SelectGroup key={vendor}>
                  <SelectLabel>{vendor}</SelectLabel>
                  {models.map((m) => {
                    const tier = modelTier(modelAvgPrice(m));
                    return (
                      <SelectItem
                        key={m.key}
                        value={m.key}
                        right={<span className={tier.className}>{tier.tier}</span>}
                      >
                        {m.key}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function tierDot(tier: string): string {
  switch (tier) {
    case 'Free': return 'bg-green-500';
    case 'Cheap': return 'bg-emerald-500';
    case 'Moderate': return 'bg-orange-500';
    default: return 'bg-red-500';
  }
}
