import { modelAvgPrice } from './cost';
import type { ModelInfo } from './types';

/** Display names for the vendor prefix of an OpenRouter id
 *  (`openai/gpt-4o-mini` → `openai`). Anything unlisted falls back to the
 *  raw prefix, so a model from a new vendor still groups sensibly without a
 *  frontend change. */
const VENDOR_LABELS: Record<string, string> = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google': 'Google',
  'meta-llama': 'Meta',
  'deepseek': 'DeepSeek',
  'qwen': 'Qwen',
  'mistralai': 'Mistral',
  'x-ai': 'xAI',
};

export function vendorOf(m: ModelInfo): string {
  const prefix = m.id.split('/')[0] ?? '';
  return VENDOR_LABELS[prefix] ?? prefix;
}

export interface VendorGroup {
  vendor: string;
  models: ModelInfo[];
}

/** Group models by vendor, cheapest first within each group, and order the
 *  groups by their cheapest member — so a picker still reads cheap→costly
 *  top to bottom while staying scannable by vendor.
 *
 *  Groups are derived from whatever list is passed in, so a caller that has
 *  already filtered some models out (as compare mode does) never renders a
 *  heading with nothing under it. */
export function groupByVendor(models: ModelInfo[]): VendorGroup[] {
  const byVendor = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const v = vendorOf(m);
    const bucket = byVendor.get(v);
    if (bucket) bucket.push(m);
    else byVendor.set(v, [m]);
  }

  const groups: VendorGroup[] = [...byVendor.entries()].map(([vendor, ms]) => ({
    vendor,
    models: [...ms].sort((a, b) => modelAvgPrice(a) - modelAvgPrice(b)),
  }));

  return groups.sort(
    (a, b) => modelAvgPrice(a.models[0]) - modelAvgPrice(b.models[0]),
  );
}
