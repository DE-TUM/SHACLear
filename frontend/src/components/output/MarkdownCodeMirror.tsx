import { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { useTheme } from '@/hooks/useTheme';
import { dimRefCommentsExtension } from '@/lib/codemirrorRefComments';

interface Props {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Markdown-aware CodeMirror editor for the output panel.
 * Same look & feel as the Turtle editor, but with markdown syntax highlighting
 * and word wrap (no line numbers — this isn't code).
 */
export function MarkdownCodeMirror({ value, onChange }: Props) {
  const theme = useTheme();

  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, dimRefCommentsExtension],
    [],
  );

  return (
    <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 markdown-editor">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={theme === 'dark' ? githubDark : githubLight}
        minHeight="160px"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          autocompletion: false,
          dropCursor: false,
          allowMultipleSelections: false,
          syntaxHighlighting: true,
        }}
      />
    </div>
  );
}
