import { useEffect, useMemo, useRef } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { turtle } from '@codemirror/legacy-modes/mode/turtle';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/hooks/useTheme';
import { estimateTokens } from '@/lib/tokens';
import { errorLineExtension, setErrorLinesEffect } from '@/lib/codemirrorErrorLines';
import {
  hoverHighlightExtension,
  setHoverHighlightEffect,
} from '@/lib/codemirrorHoverHighlight';
import { extractPropertyLineMap } from '@/lib/turtlePropertyMap';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Optional toolbar rendered as an overlay in the top-right corner. */
  actions?: React.ReactNode;
  /** Optional centered hint shown over the editor while it is empty. */
  emptyState?: React.ReactNode;
}

/**
 * Reusable Turtle-aware CodeMirror editor.
 * Used by both the "Plain Turtle" tab and the file-upload code preview.
 */
export function TurtleCodeMirror({
  value,
  onChange,
  placeholder,
  minHeight = '360px',
  actions,
  emptyState,
}: Props) {
  const theme = useTheme();
  const { errorLines, hoveredRef } = useAppStore();
  const viewRef = useRef<EditorView | null>(null);

  const extensions = useMemo(
    () => [
      StreamLanguage.define(turtle),
      EditorView.lineWrapping,
      errorLineExtension,
      hoverHighlightExtension,
    ],
    [],
  );

  // Push error-line decorations to the editor whenever the set changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setErrorLinesEffect.of(errorLines) });
  }, [errorLines]);

  // Highlight lines in the Turtle editor when the user hovers an
  // explanation paragraph (via the `<!-- ref: X -->` markers).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!hoveredRef) {
      view.dispatch({ effects: setHoverHighlightEffect.of([]) });
      return;
    }
    const map = extractPropertyLineMap(value);
    const ranges = map.get(hoveredRef) ?? [];
    view.dispatch({ effects: setHoverHighlightEffect.of(ranges) });
  }, [hoveredRef, value]);

  const tokenCount = estimateTokens(value);

  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 turtle-editor card-lift',
        'transition-colors focus-within:border-brand-400 dark:focus-within:border-brand-500',
        actions && 'turtle-editor-toolbar',
        value.trim().length === 0 && 'turtle-editor-empty',
      )}
    >
      {actions && (
        <div className="absolute top-2 right-2.5 z-10 flex items-center gap-0.5 rounded-md border border-zinc-200/80 bg-white/80 px-0.5 py-0.5 shadow-sm backdrop-blur-sm dark:border-zinc-700/70 dark:bg-zinc-900/75">
          {actions}
        </div>
      )}
      {emptyState && value.trim().length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-6">
          {emptyState}
        </div>
      )}
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={theme === 'dark' ? githubDark : githubLight}
        minHeight={minHeight}
        onCreateEditor={(view) => {
          viewRef.current = view;
          if (errorLines.length > 0) {
            view.dispatch({ effects: setErrorLinesEffect.of(errorLines) });
          }
        }}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightSelectionMatches: false,
          autocompletion: false,
        }}
      />
      <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white/80 px-2 py-0.5 text-[0.65rem] font-mono text-zinc-500 shadow-sm backdrop-blur-sm dark:border-zinc-700/70 dark:bg-zinc-900/75 dark:text-zinc-400">
        <span>{tokenCount.toLocaleString()} tokens</span>
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <span>{value.length} chars</span>
      </div>
    </div>
  );
}
