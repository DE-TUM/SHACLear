import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HistoryEntry, PromptMode } from '@/lib/types';

interface UploadedFile {
  name: string;
  turtle: string;
}

interface AppState {
  // Input
  inputText: string;
  uploadedFile: UploadedFile | null;
  selectedTab: 'text' | 'upload';

  // Settings
  model: string;
  mode: PromptMode;
  reflection: boolean;

  // Compare mode (ephemeral — never persisted)
  viewMode: 'single' | 'compare';
  compareModels: string[];

  // Output
  history: HistoryEntry[];
  currentResult: HistoryEntry | null;
  generationCounter: number;

  // Streaming (ephemeral — never persisted)
  streaming: boolean;
  streamText: string;

  // Validation feedback
  validationError: string | null;

  // Line numbers (1-based) to highlight as errors in the Turtle editor
  errorLines: number[];

  // Ref key (e.g. "title" or "shape:closed") of the currently hovered
  // explanation paragraph, or null. Drives the bidirectional highlight
  // from output → SHACL editor. Ephemeral — never persisted.
  hoveredRef: string | null;

  // Actions
  setInputText: (s: string) => void;
  clearInput: () => void;
  setUploadedFile: (f: UploadedFile | null) => void;
  setSelectedTab: (t: 'text' | 'upload') => void;
  setModel: (m: string) => void;
  setMode: (m: PromptMode) => void;
  setReflection: (b: boolean) => void;
  setViewMode: (v: 'single' | 'compare') => void;
  /** Add/remove a model from the compare set (capped at 3). */
  toggleCompareModel: (m: string) => void;
  setValidationError: (msg: string | null) => void;
  setErrorLines: (lines: number[]) => void;
  setHoveredRef: (ref: string | null) => void;
  addEntry: (entry: HistoryEntry) => void;
  /** Append several entries (one compare run) without changing the single-view current result. */
  addCompareEntries: (entries: HistoryEntry[]) => void;
  setCurrent: (entry: HistoryEntry) => void;
  /** Start a streaming generation (clears any partial text). */
  beginStream: () => void;
  /** Append an incremental chunk to the streaming buffer. */
  pushStreamDelta: (text: string) => void;
  /** Discard streamed text so far (used when a reflection pass begins). */
  clearStreamText: () => void;
  /** End streaming mode. */
  endStream: () => void;
  /** Update the current entry's explanation (also reflected in the history). */
  updateCurrentExplanation: (text: string) => void;
  bumpGeneration: () => number;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      inputText: '',
      uploadedFile: null,
      selectedTab: 'text',
      model: 'GPT-4o mini',
      mode: 'c', // demo build ships only Mode C (raw Turtle baseline)
      reflection: false,
      viewMode: 'single',
      compareModels: [],
      history: [],
      currentResult: null,
      generationCounter: 0,
      streaming: false,
      streamText: '',
      validationError: null,
      errorLines: [],
      hoveredRef: null,

      setInputText: (s) => set({ inputText: s }),
      clearInput: () => set({ inputText: '', currentResult: null, validationError: null }),
      setUploadedFile: (f) => set({ uploadedFile: f }),
      // Switching tabs also reconciles the Output panel: it must always
      // reflect the input shown on the left. If the current result was
      // generated from a different source (text vs upload), we replace it
      // with the most recent history entry for the new tab — or clear it
      // entirely when there's no matching prior generation.
      setSelectedTab: (t) =>
        set((s) => {
          const newSource: 'text' | 'upload' = t === 'upload' ? 'upload' : 'text';
          if (s.currentResult && s.currentResult.source === newSource) {
            return { selectedTab: t };
          }
          const matching = [...s.history].reverse().find(
            (h) => h.source === newSource && !h.compare,
          );
          return { selectedTab: t, currentResult: matching ?? null };
        }),
      setModel: (m) => set({ model: m }),
      setMode: (m) => set({ mode: m }),
      setReflection: (b) => set({ reflection: b }),
      setViewMode: (v) => set({ viewMode: v }),
      toggleCompareModel: (m) =>
        set((s) => {
          if (s.compareModels.includes(m)) {
            return { compareModels: s.compareModels.filter((x) => x !== m) };
          }
          if (s.compareModels.length >= 3) return s; // cap at 3
          return { compareModels: [...s.compareModels, m] };
        }),
      setValidationError: (msg) => set({ validationError: msg }),
      setErrorLines: (lines) => set({ errorLines: lines }),
      setHoveredRef: (ref) => set({ hoveredRef: ref }),
      addEntry: (entry) =>
        set((s) => ({
          history: [...s.history, entry],
          currentResult: entry,
        })),
      addCompareEntries: (entries) =>
        set((s) => ({ history: [...s.history, ...entries] })),
      setCurrent: (entry) => set({ currentResult: entry }),
      beginStream: () => set({ streaming: true, streamText: '' }),
      pushStreamDelta: (text) => set((s) => ({ streamText: s.streamText + text })),
      clearStreamText: () => set({ streamText: '' }),
      endStream: () => set({ streaming: false, streamText: '' }),
      updateCurrentExplanation: (text) =>
        set((s) => {
          if (!s.currentResult) return s;
          const updated = { ...s.currentResult, explanation: text };
          return {
            currentResult: updated,
            history: s.history.map((h) => (h.id === updated.id ? updated : h)),
          };
        }),
      bumpGeneration: () => {
        const next = get().generationCounter + 1;
        set({ generationCounter: next });
        return next;
      },
      reset: () =>
        set({
          inputText: '',
          uploadedFile: null,
          history: [],
          currentResult: null,
          generationCounter: 0,
          validationError: null,
        }),
    }),
    {
      name: 'shacl-nl-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // Input — persisted so a refresh doesn't leave a blank editor next to a restored result.
        inputText: s.inputText,
        uploadedFile: s.uploadedFile,
        selectedTab: s.selectedTab,
        history: s.history,
        currentResult: s.currentResult,
        generationCounter: s.generationCounter,
        model: s.model,
        mode: s.mode,
        reflection: s.reflection,
      }),
    },
  ),
);
