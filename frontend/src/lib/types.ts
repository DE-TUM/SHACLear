export type PromptMode = 'a' | 'b' | 'c';

export const MODE_LABELS: Record<PromptMode, string> = {
  a: 'Mode A – Structured',
  b: 'Mode B – Fine-Grained',
  c: 'Mode C – Baseline',
};

export interface ModelInfo {
  key: string;
  id: string;
  input_price: number;
  output_price: number;
}

export interface GenerationResult {
  explanation: string;
  preprocessed: string;
  tokens: number;
  cost: number;
  elapsed_s: number;
  model: string;
  mode: string;
}

export interface HistoryEntry extends GenerationResult {
  id: string;
  /** The turtle text used as input (after any user edits). */
  input: string;
  /** Where the input came from at generation time. */
  source: 'text' | 'upload';
  /** Filename if `source === 'upload'`. */
  filename?: string;
  mode_label: string;
  time: string;
  generation: number;
  refined: boolean;
  refine_instruction?: string;
  /** True for entries produced by a side-by-side compare run (N models share one generation). */
  compare?: boolean;
}

/** Final `done` event from the streaming generate endpoint. */
export interface StreamDone {
  tokens: number;
  cost: number;
  elapsed_s: number;
  model: string;
  mode: string;
  preprocessed: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export type CostTier = 'Free' | 'Trace' | 'Cheap' | 'Moderate' | 'Expensive';
