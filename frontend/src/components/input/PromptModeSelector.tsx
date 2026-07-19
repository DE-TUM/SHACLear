import { Info } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';
import { PROMPT_MODES } from '@/lib/constants';
import type { PromptMode } from '@/lib/types';

interface ModeDescription {
  title: string;
  summary: string;
  best: string;
}

const MODE_INFO: Record<PromptMode, ModeDescription> = {
  a: {
    title: 'Mode A – Structured',
    summary:
      'Preprocesses the SHACL shape into a clean Property / Rule / Value table and sends it to the LLM together with the original raw Turtle — so the model gets both a compact structured overview and the full syntactic detail.',
    best: 'Best for shapes with many properties — gives the LLM a compact overview at a glance, with the raw Turtle as fallback for anything the preprocessor abstracts away.',
  },
  b: {
    title: 'Mode B – Fine-Grained',
    summary:
      'Sends each constraint to the LLM individually as a separate API call, then merges the responses. Runs on the original pre-marker pipeline (no raw Turtle context, no reference markers) so its results stay comparable to the historical baseline.',
    best: 'Most detailed explanations but slowest and most expensive (one call per constraint). Does not support hover-to-highlight.',
  },
  c: {
    title: 'Mode C – Baseline',
    summary:
      'Sends the raw Turtle syntax directly with no preprocessing. The LLM parses SHACL itself.',
    best: 'Useful as a baseline for evaluation — measures how well the LLM handles SHACL natively.',
  },
};

export function PromptModeSelector() {
  const { mode, setMode } = useAppStore();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          Prompt Strategy
        </label>
        <PromptModeInfo />
      </div>
      <Select value={mode} onValueChange={(v) => setMode(v as PromptMode)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROMPT_MODES.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PromptModeInfo() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="About prompt strategies"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-sm">
          <div className="space-y-3">
            <p className="text-[0.7rem] uppercase tracking-wider font-bold text-zinc-500 dark:text-zinc-400">
              Prompt strategies
            </p>
            {(['a', 'b', 'c'] as const).map((k) => {
              const info = MODE_INFO[k];
              return (
                <div key={k}>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
                    {info.title}
                  </p>
                  <p className="text-zinc-600 dark:text-zinc-300">{info.summary}</p>
                  <p className="text-zinc-500 dark:text-zinc-400 italic mt-0.5">
                    {info.best}
                  </p>
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
