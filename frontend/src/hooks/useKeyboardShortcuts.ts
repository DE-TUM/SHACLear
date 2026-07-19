import { useEffect } from 'react';

export interface ShortcutHandler {
  /** Lower-case key. */
  key: string;
  cmd?: boolean;
  shift?: boolean;
  handler: (e: KeyboardEvent) => void;
  /** If true, the handler also fires when focus is inside an input/textarea. */
  allowInInput?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    target.closest('.cm-editor') !== null
  );
}

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmdKey = e.metaKey || e.ctrlKey;
      for (const s of shortcuts) {
        if (e.key.toLowerCase() !== s.key) continue;
        if (!!s.cmd !== cmdKey) continue;
        if (!!s.shift !== e.shiftKey) continue;
        if (!s.allowInInput && isEditable(e.target)) {
          // Always allow ⌘+Enter even inside inputs — that's the canonical "submit" shortcut.
          if (!(s.cmd && s.key === 'enter')) continue;
        }
        e.preventDefault();
        s.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcuts]);
}
