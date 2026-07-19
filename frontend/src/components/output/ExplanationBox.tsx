import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, FileText, Pencil, Eye, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { renderMarkdown } from '@/lib/markdown';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/Tooltip';
import { useAppStore } from '@/store/useAppStore';
import { MarkdownCodeMirror } from './MarkdownCodeMirror';

/** sessionStorage key for the "toast once per tab" hint. Uses
 *  sessionStorage rather than localStorage so a fresh browser tab (as
 *  in a live demo) always gets the hint again. */
const HINT_TOAST_SESSION_KEY = 'shacl-nl-hint-toast-shown';

interface Props {
  text: string;
  isLoading?: boolean;
  /** True while text is being streamed in (no toolbar, shows a live caret). */
  isStreaming?: boolean;
}

export function ExplanationBox({ text, isLoading, isStreaming }: Props) {
  const { updateCurrentExplanation, currentResult, setHoveredRef } = useAppStore();
  const html = useMemo(() => renderMarkdown(text), [text]);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  // ── Highlight-hint UX ──────────────────────────────────────────
  // Toast fires once per browser tab (sessionStorage), the first time an
  // explanation actually arrives. A ref guard prevents a re-render from
  // firing it twice within the same tab. The permanent info icon in the
  // header (rendered further below) always makes the feature discoverable
  // even after the toast is gone.
  const toastFiredRef = useRef(false);
  useEffect(() => {
    if (toastFiredRef.current) return;
    if (isStreaming || isLoading) return;
    if (!text) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(HINT_TOAST_SESSION_KEY) === 'true') return;
    toastFiredRef.current = true;
    toast.info('Hover a paragraph to highlight the matching SHACL lines.', {
      duration: 6000,
      icon: <Sparkles className="h-4 w-4" />,
    });
    try { sessionStorage.setItem(HINT_TOAST_SESSION_KEY, 'true'); } catch { /* ignore */ }
  }, [text, isLoading, isStreaming]);

  // Exit edit mode if a new generation arrives or the result changes
  useEffect(() => {
    setEditing(false);
  }, [currentResult?.id]);

  // Event delegation for hover-to-link: we render the explanation HTML via
  // dangerouslySetInnerHTML, so we can't attach React handlers to the
  // generated `[data-ref]` divs directly. Listen at the wrapper instead.
  //
  // IMPORTANT: pointerover fires on the wrapper's own padding when the
  // cursor leaves a paragraph and moves into the top or side gutter. If we
  // only *set* the ref on match and never clear it here, the previous
  // paragraph stays highlighted until the pointer actually leaves the
  // wrapper, which is why hovering the gutter used to keep highlighting the
  // topmost paragraph. Setting `null` when no ref-section is under the
  // cursor makes the highlight follow the pointer exactly.
  const onPointerOver = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('[data-ref]');
    const ref = el?.getAttribute('data-ref') ?? null;
    setHoveredRef(ref);
  };
  const onPointerLeave = () => setHoveredRef(null);
  // Clear on unmount or when result changes
  useEffect(() => {
    return () => setHoveredRef(null);
  }, [currentResult?.id, setHoveredRef]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  // Streaming with text in hand: render progressively, read-only, with a caret.
  if (isStreaming && text) return <StreamingBox html={html} />;
  // Loading but nothing streamed yet (or a non-streaming refine): thinking view.
  if (isLoading) return <Skeleton />;
  if (!text) return <EmptyState />;

  // The hover-to-highlight feature is deliberately disabled for refined
  // results (the refinement pass strips the ref markers), so hide the info
  // icon in that case to avoid promising a feature the current output does
  // not support.
  const showHighlightIcon = !currentResult?.refined;

  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white shadow-sm card-lift dark:border-zinc-800 dark:bg-zinc-900">
      {/* Info icon — top-left, isolated from the Edit/Copy cluster on the right. */}
      {showHighlightIcon && (
        <div className="absolute top-2 left-2.5 z-10">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About the hover-to-highlight feature"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-brand-500 hover:bg-brand-50 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-brand-500/20 dark:hover:text-brand-100 transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                Hover a paragraph to highlight the matching SHACL lines on the left.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Edit + Copy — top-right. */}
      <div className="absolute top-2 right-2.5 z-10 flex items-center gap-1">
        <button
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? 'Switch to preview' : 'Edit explanation'}
          title={editing ? 'Switch to preview' : 'Edit explanation'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          {editing ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>
        <button
          onClick={onCopy}
          aria-label="Copy explanation"
          title="Copy explanation"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {editing ? (
        <div className="px-3 pt-12 pb-3">
          <MarkdownCodeMirror
            value={text}
            onChange={updateCurrentExplanation}
          />
        </div>
      ) : (
        <div
          className="px-5 pt-12 pb-5 pr-14 text-sm leading-relaxed text-zinc-700 explanation-body dark:text-zinc-200"
          onPointerOver={onPointerOver}
          onPointerLeave={onPointerLeave}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

/** Read-only progressive render of the explanation while it streams in. */
function StreamingBox({ html }: { html: string }) {
  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white shadow-sm card-lift dark:border-zinc-800 dark:bg-zinc-900">
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden rounded-t-xl">
        <div className="loading-sweep absolute top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
      </div>
      <div className="px-5 py-5 text-sm leading-relaxed text-zinc-700 explanation-body dark:text-zinc-200">
        <span dangerouslySetInnerHTML={{ __html: html }} />
        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-brand-500 align-middle" />
      </div>
    </div>
  );
}

const THINKING_MESSAGES = [
  'Parsing the SHACL shape',
  'Extracting constraints',
  'Building the prompt',
  'Asking the model',
  'Composing explanation',
];

function Skeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
        <div className="loading-sweep absolute top-0 h-px w-1/3 bg-gradient-to-r from-transparent via-brand-500 to-transparent" />
      </div>
      <div className="flex flex-col items-center justify-center gap-5 px-5 py-12">
        <ThinkingGraph />
        <ThinkingMessage />
      </div>
    </div>
  );
}

function ThinkingGraph() {
  return (
    <svg
      width="160" height="80" viewBox="0 0 160 80"
      className="text-brand-600 dark:text-brand-400"
      aria-hidden="true"
    >
      <line className="thinking-edge thinking-edge-1" x1="20" y1="40" x2="70" y2="20" />
      <line className="thinking-edge thinking-edge-2" x1="20" y1="40" x2="70" y2="60" />
      <line className="thinking-edge thinking-edge-3" x1="80" y1="20" x2="140" y2="40" />
      <line className="thinking-edge thinking-edge-4" x1="80" y1="60" x2="140" y2="40" />
      <circle className="thinking-node thinking-node-1" cx="20"  cy="40" r="7" />
      <circle className="thinking-node thinking-node-2" cx="75"  cy="20" r="7" />
      <circle className="thinking-node thinking-node-3" cx="75"  cy="60" r="7" />
      <circle className="thinking-node thinking-node-4" cx="140" cy="40" r="7" />
      <circle
        cx="140" cy="40" r="13"
        fill="none" stroke="currentColor" strokeOpacity="0.4"
        strokeWidth="1.5" strokeDasharray="4 4"
        className="thinking-halo"
      />
    </svg>
  );
}

function ThinkingMessage() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % THINKING_MESSAGES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="min-h-[1.4em] text-center">
      <span
        key={idx}
        className="thinking-message inline-block text-sm font-medium text-zinc-700 dark:text-zinc-200"
      >
        {THINKING_MESSAGES[idx]}
        <span className="thinking-dots ml-0.5">…</span>
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
        <FileText className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
        No explanation yet
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
        Add a SHACL shape on the left and press <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.7rem] dark:bg-zinc-800">⌘ + ↵</kbd> to generate.
      </p>
    </div>
  );
}
