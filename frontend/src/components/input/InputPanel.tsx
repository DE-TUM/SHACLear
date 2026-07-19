import { useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { TurtleEditor } from './TurtleEditor';
import { FileUploadCard } from './FileUploadCard';
import { ModelSelector } from './ModelSelector';
// Kept as a comment for the demo build; see the render section below.
// import { PromptModeSelector } from './PromptModeSelector';
import { ReflectionToggle } from './ReflectionToggle';
import { useAppStore } from '@/store/useAppStore';
import { useGenerate } from '@/hooks/useGenerate';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { EXAMPLE_SHAPE } from '@/lib/constants';

export function InputPanel() {
  const {
    inputText, uploadedFile, selectedTab, setSelectedTab,
    setInputText, clearInput,
    model, reflection,
  } = useAppStore();
  const generate = useGenerate();

  // Demo build ships only Mode C (raw Turtle baseline). We hard-code the
  // mode here so persisted mode='a'/'b' in localStorage cannot leak in.
  const mode = 'c' as const;

  const turtle = selectedTab === 'upload' ? uploadedFile?.turtle ?? '' : inputText;
  const canGenerate = turtle.trim().length > 0 && !generate.isPending;

  const onGenerate = useCallback(() => {
    if (!canGenerate) return;
    generate.mutate({ turtle, model, mode, reflection });
  }, [canGenerate, generate, turtle, model, mode, reflection]);

  useKeyboardShortcuts([
    { key: 'enter', cmd: true, handler: onGenerate, allowInInput: true },
    { key: 'l', cmd: true, handler: () => setInputText(EXAMPLE_SHAPE) },
    { key: 'k', cmd: true, shift: true, handler: clearInput },
  ]);

  return (
    <section className="flex flex-col gap-4">
      <Tabs
        value={selectedTab}
        onValueChange={(v) => setSelectedTab(v as 'text' | 'upload')}
        className="flex flex-col gap-4"
      >
        <div className="flex min-h-[2.25rem] items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Input
          </h2>
          <TabsList>
            <TabsTrigger value="text">Plain Turtle</TabsTrigger>
            <TabsTrigger value="upload">Upload File</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="text" className="mt-0">
          <TurtleEditor />
        </TabsContent>
        <TabsContent value="upload" className="mt-0">
          <FileUploadCard />
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 gap-3">
        <ModelSelector />
        {/*
          Mode selector removed from the demo build — this branch ships only
          the Mode C (raw Turtle baseline) prompting strategy. Kept as a
          comment so it can be re-enabled later.
          <PromptModeSelector />
        */}
      </div>

      <ReflectionToggle />

      {/* Sticky Generate Button */}
      <div className="sticky bottom-4 z-10">
        <Button
          onClick={onGenerate}
          disabled={!canGenerate}
          variant="primary"
          size="lg"
          className="w-full shadow-lg shadow-brand-600/20"
        >
          {generate.isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              Generating…
            </span>
          ) : (
            <>
              Generate Explanation
              <kbd className="ml-3 text-[0.7rem] font-mono opacity-70">⌘ ↵</kbd>
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
