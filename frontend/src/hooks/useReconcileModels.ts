import { useEffect } from 'react';
import { useModels } from '@/hooks/useModels';
import { useAppStore } from '@/store/useAppStore';

const DEFAULT_MODEL = 'GPT-4o mini';

/**
 * The persisted `model` selection can go stale when a model is renamed or
 * removed in the backend — the old key then matches no `<SelectItem>`, leaving
 * the picker blank and crashing generation with a 400. Once the live model list
 * loads, fall back to a sane default if the saved key no longer exists.
 * (`compareModels` is ephemeral/never persisted, so it can't go stale here.)
 */
export function useReconcileModels() {
  const { data } = useModels();
  const model = useAppStore((s) => s.model);
  const setModel = useAppStore((s) => s.setModel);

  useEffect(() => {
    if (!data?.models?.length) return;
    const keys = data.models.map((m) => m.key);
    if (keys.includes(model)) return;
    setModel(keys.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : keys[0]);
  }, [data?.models, model, setModel]);
}
