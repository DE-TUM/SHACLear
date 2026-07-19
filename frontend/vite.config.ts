import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Bind to all network interfaces (IPv4 + IPv6 + LAN). Without this,
    // Vite's default binds inconsistently on macOS — sometimes only to
    // IPv4 (127.0.0.1), sometimes only to IPv6 (::1) — so either
    // `localhost:5173` or `127.0.0.1:5173` hangs depending on the day.
    host: true,
    // Warm up critical entry files so the first page load isn't blocked
    // on cold dep-bundling of CodeMirror + Radix.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/components/input/TurtleCodeMirror.tsx',
        './src/components/output/MarkdownCodeMirror.tsx',
      ],
    },
  },
  optimizeDeps: {
    // Pre-bundle the heavy graphs eagerly so cold starts after
    // `rm -rf node_modules/.vite` don't take 30+ seconds.
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'zustand',
      'zustand/middleware',
      'lucide-react',
      'sonner',
      'marked',
      'isomorphic-dompurify',
      '@uiw/react-codemirror',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/lang-markdown',
      '@codemirror/legacy-modes/mode/turtle',
      '@uiw/codemirror-theme-github',
      '@radix-ui/react-tabs',
      '@radix-ui/react-select',
      '@radix-ui/react-switch',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-accordion',
    ],
  },
});
