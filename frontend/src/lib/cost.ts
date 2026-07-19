import type { CostTier, ModelInfo } from './types';

export interface CostLabel {
  value: string;
  tier: CostTier;
  color: string;
}

export function costLabel(cost: number): CostLabel {
  if (cost === 0) return { value: '$0.00', tier: 'Free', color: 'bg-green-600' };
  if (cost < 0.001) {
    const v = cost.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return { value: `$${v}`, tier: 'Trace', color: 'bg-green-600' };
  }
  if (cost < 0.01)  return { value: `$${cost.toFixed(4)}`, tier: 'Cheap',     color: 'bg-green-600' };
  if (cost < 0.05)  return { value: `$${cost.toFixed(4)}`, tier: 'Moderate',  color: 'bg-orange-500' };
  return                  { value: `$${cost.toFixed(4)}`, tier: 'Expensive', color: 'bg-red-600' };
}

/* ── Model-level tier (based on per-1M-token pricing) ─────────────── */

export type ModelTier = 'Free' | 'Cheap' | 'Moderate' | 'Expensive';

export interface ModelTierBadge {
  tier: ModelTier;
  /** Tailwind classes for a small pill badge. */
  className: string;
}

/** Average of input + output price per 1M tokens. */
export function modelAvgPrice(m: Pick<ModelInfo, 'input_price' | 'output_price'>): number {
  return (m.input_price + m.output_price) / 2;
}

export function modelTier(avgPrice: number): ModelTierBadge {
  const base = 'rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide';
  if (avgPrice === 0) {
    return { tier: 'Free', className: `${base} bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300` };
  }
  if (avgPrice <= 0.5) {
    return { tier: 'Cheap', className: `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300` };
  }
  if (avgPrice <= 2) {
    return { tier: 'Moderate', className: `${base} bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300` };
  }
  return { tier: 'Expensive', className: `${base} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300` };
}
