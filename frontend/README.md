# SHACL → Natural Language — React Frontend

React/TypeScript/Vite frontend for the SHACL-to-Natural-Language tool.
Communicates with the FastAPI backend in `../backend`.

## Setup

```bash
cd frontend
npm install
cp .env.example .env       # adjust VITE_API_BASE if your backend runs elsewhere
```

## Development

```bash
# Start backend first (separate terminal, from project root):
uvicorn backend.main:app --reload --port 8000

# Then start the frontend:
npm run dev
# → http://localhost:5173
```

## Build

```bash
npm run build
npm run preview
```

## Stack

- React 18 + TypeScript
- Vite
- TailwindCSS
- Radix UI primitives (Tabs, Select, Checkbox, Accordion)
- Zustand (with localStorage persistence)
- TanStack Query (server state)
- Marked + DOMPurify (markdown rendering)
- lucide-react (icons)

## Architecture

```
src/
├── components/
│   ├── layout/      # Header, ViewToggle (single / compare)
│   ├── input/       # InputPanel + sub-components
│   ├── output/      # OutputPanel + sub-components
│   ├── compare/     # Side-by-side multi-model comparison view
│   └── ui/          # Reusable primitives (Button, Tabs, Select, …)
├── hooks/           # useGenerate, useRefine, useFileUpload, useModels
├── store/           # Zustand store (persisted)
├── lib/             # api client, types, markdown helpers, cost calc
└── styles/          # global styles
```
