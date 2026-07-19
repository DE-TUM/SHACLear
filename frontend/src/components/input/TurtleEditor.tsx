import { useState } from 'react';
import { Copy, Check, FileCode } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { EXAMPLE_SHAPE } from '@/lib/constants';
import { TurtleCodeMirror } from './TurtleCodeMirror';

export function TurtleEditor() {
  const { inputText, setInputText, clearInput } = useAppStore();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(inputText);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <TurtleCodeMirror
      value={inputText}
      onChange={setInputText}
      actions={
        <>
          <Button onClick={() => setInputText(EXAMPLE_SHAPE)} variant="ghost" size="sm">
            Load example
          </Button>
          <Button
            onClick={onCopy}
            variant="ghost"
            size="sm"
            disabled={!inputText}
            aria-label="Copy Turtle"
            title="Copy Turtle"
            className="px-2"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button onClick={clearInput} variant="ghost" size="sm" disabled={!inputText}>
            Clear
          </Button>
        </>
      }
      emptyState={
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
            <FileCode className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Start with a SHACL shape
            </h3>
            <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">
              Paste Turtle here, or use{' '}
              <span className="font-medium text-zinc-600 dark:text-zinc-300">Load example</span>{' '}
              above to try it out.
            </p>
          </div>
        </div>
      }
    />
  );
}
