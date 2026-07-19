import { Switch } from '@/components/ui/Switch';
import { useAppStore } from '@/store/useAppStore';

export function ReflectionToggle() {
  const { reflection, setReflection } = useAppStore();
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 cursor-pointer select-none dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Reflection mode
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Two-pass self-review (slower, often higher quality)
        </span>
      </div>
      <Switch
        checked={reflection}
        onCheckedChange={setReflection}
        aria-label="Toggle reflection mode"
      />
    </label>
  );
}
