import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/Accordion';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useRefine } from '@/hooks/useRefine';

export function RefineSection() {
  const { currentResult, model } = useAppStore();
  const [instruction, setInstruction] = useState('');
  const [open, setOpen] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const refine = useRefine();

  // Focus the instruction box as soon as the accordion is expanded.
  useEffect(() => {
    if (open === 'refine') textareaRef.current?.focus();
  }, [open]);

  if (!currentResult) return null;

  const onRefine = () => {
    if (!instruction.trim()) return;
    refine.mutate({
      turtle: currentResult.input,
      previous_output: currentResult.explanation,
      instruction: instruction.trim(),
      model,
    }, {
      onSuccess: () => setInstruction(''),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRefine();
    }
  };

  return (
    <Accordion type="single" collapsible value={open} onValueChange={setOpen}>
      <AccordionItem value="refine">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Edit & Refine
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder='e.g. "Make it shorter" · "Explain in German" · "Use bullet points"'
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none overflow-y-auto [field-sizing:content] max-h-[calc(7lh+1rem)] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <Button
              onClick={onRefine}
              disabled={refine.isPending || !instruction.trim()}
              variant="primary"
              className="w-full"
            >
              {refine.isPending ? (
                'Refining…'
              ) : (
                <>
                  Refine
                  <kbd className="ml-3 text-[0.7rem] font-mono opacity-70">⌘ ↵</kbd>
                </>
              )}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
