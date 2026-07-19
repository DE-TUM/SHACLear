import { Header } from '@/components/layout/Header';
import { InputPanel } from '@/components/input/InputPanel';
import { OutputPanel } from '@/components/output/OutputPanel';
import { CompareView } from '@/components/compare/CompareView';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/hooks/useTheme';
import { useReconcileModels } from '@/hooks/useReconcileModels';

export default function App() {
  useTheme(); // applies theme class to <html>
  useReconcileModels(); // drop stale persisted model selections
  const viewMode = useAppStore((s) => s.viewMode);

  return (
    <div className="app-shell min-h-screen text-zinc-900 dark:text-zinc-100 transition-colors">
      <Header />
      <main className="mx-auto max-w-[1600px] px-6 py-8">
        {viewMode === 'compare' ? (
          <CompareView />
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <InputPanel />
            <OutputPanel />
          </div>
        )}
      </main>
    </div>
  );
}
