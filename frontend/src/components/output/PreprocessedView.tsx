import { useState } from 'react';
import { FileCode, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/Accordion';

export function PreprocessedView({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;

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

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="prep">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <FileCode className="h-4 w-4" /> Preprocessed input sent to LLM
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="relative">
            <button
              onClick={onCopy}
              aria-label="Copy preprocessed input"
              title="Copy preprocessed input"
              className="absolute top-2 right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <pre className="rounded-lg bg-zinc-900 text-zinc-100 px-4 py-3 pr-12 text-xs font-mono whitespace-pre-wrap overflow-x-auto dark:bg-zinc-950 dark:border dark:border-zinc-800">
              {text}
            </pre>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
