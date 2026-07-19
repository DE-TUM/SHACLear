import { useMemo } from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { useModels } from '@/hooks/useModels';
import { useAppStore } from '@/store/useAppStore';
import { modelAvgPrice, modelTier } from '@/lib/cost';
import { groupByVendor } from '@/lib/models';

export function ModelSelector() {
  const { model, setModel } = useAppStore();
  const { data, isLoading } = useModels();

  const groups = useMemo(
    () => (data?.models ? groupByVendor(data.models) : []),
    [data?.models],
  );

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">LLM Model</label>
      <Select value={model} onValueChange={setModel} disabled={isLoading}>
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? 'Loading models…' : 'Pick a model'} />
        </SelectTrigger>
        <SelectContent>
          {groups.map(({ vendor, models }) => (
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
    </div>
  );
}
