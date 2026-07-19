# SHACL to Natural Language Interface — Demo Build

A web application that translates SHACL constraint shapes into natural
language explanations using LLMs. Developed as part of the BPC Data
Engineering course at TUM (SS 2026).

The frontend is a React/TypeScript SPA built with Vite. The backend is a
FastAPI service that wraps the SHACL parsing logic and the OpenRouter
LLM client.

## Live Demo

<https://purl.archive.org/shacl2nl>
<http://shacl2nl-env.eba-gmtwkajc.eu-north-1.elasticbeanstalk.com/>

## Features

- Paste SHACL shapes (Turtle format) or upload `.ttl` / `.rdf` files
  (drag & drop)
- Choose from multiple LLMs via OpenRouter (Llama, Gemma, DeepSeek,
  GPT-4o mini, Claude)
- Streams the explanation token by token, with live token count, cost
  and latency metrics
- **Explanation-to-source highlighting** — hover a paragraph in the
  explanation to highlight the corresponding SHACL lines in the editor
  (a one-time banner and toast point new users at this feature)
- **Preprocessed input viewer** — inspect the *entire* prompt sent to
  the LLM (system message + few-shot example + task intro + input)
- Reflection mode (two-pass self-review)
- Refine workflow for follow-up edits
- **Compare mode** — run the same shape across 2–3 models side by side
  and compare explanation quality, cost, tokens, and latency (with
  per-metric winner highlighting)
- Revision history with per-generation grouping
- Polished light & dark themes, in-editor toolbar (load example, copy,
  clear), and empty-state guidance

## Tech Stack

**Frontend**
- React 18 + TypeScript + Vite
- Tailwind CSS + Radix UI primitives
- Zustand (state, with localStorage persistence)
- TanStack Query (server state)
- CodeMirror (Turtle syntax highlighting)
- Sonner (toast notifications)

**Backend**
- FastAPI + Uvicorn
- [RDFLib](https://rdflib.readthedocs.io) — SHACL/Turtle parsing
- [PySHACL](https://github.com/RDFLib/pySHACL) — constraint validation
- [OpenRouter](https://openrouter.ai) — unified LLM API gateway

**Deployment**
- Docker (multi-stage build: frontend built with Node, served by the
  FastAPI backend as static files — single container, single port)

## Project Structure

```
shacl-nl-interface/
├── frontend/                  # React/TypeScript SPA (Vite)
│   └── src/
│       ├── components/        # UI components (layout, input, output, compare, ui)
│       ├── hooks/             # useGenerate, useRefine, useFileUpload, useModels, …
│       ├── store/             # Zustand store
│       └── lib/               # API client, types, markdown, cost, highlight
│
├── backend/                   # FastAPI REST adapter
│   └── main.py
│
├── core/                      # Pure business logic (framework-agnostic)
│   ├── shacl_parser.py        # SHACL parsing + preprocessing
│   ├── prompts.py             # System prompt + few-shot examples + prompt builder
│   └── llm_client.py          # OpenRouter client + per-model pricing
│
├── demo/                      # Example SHACL shapes for manual testing/demos
├── tests/                     # pytest unit + integration tests
│
├── Dockerfile                 # Multi-stage build: frontend (Node) -> backend (Python)
├── .dockerignore
│
└── pyproject.toml             # Single source of truth for Python deps
```

## Running it with Docker (recommended)

This is the fastest way to get the app running — you don't need Node.js or
Python installed locally, only Docker.

You'll need an [OpenRouter](https://openrouter.ai) API key either way; the
app calls OpenRouter server-side to generate explanations, and it won't work
without one. Your key is passed in at `docker run` time as an environment
variable — it is never baked into the image or committed anywhere in this
repo.

### Option A — Pull the prebuilt image (fastest)

```bash
docker pull yuchenz0604/shacl2nl:latest

docker run -p 8080:80 \
  -e OPENROUTER_API_KEY=sk-or-v1-your-key-here \
  yuchenz0604/shacl2nl:latest
```

Then open <http://localhost:8080>.

### Option B — Build the image from source

Useful if you've made changes to the code and want to test your own build.

```bash
git clone https://github.com/DE-TUM/SHACL2NL-Translator.git
cd shacl-nl-interface
git checkout feature/demo-code

docker build -t shacl2nl:local .

docker run -p 8080:80 \
  -e OPENROUTER_API_KEY=sk-or-v1-your-key-here \
  shacl2nl:local
```

Then open <http://localhost:8080>.

> **Note:** the container serves both the frontend and the backend from the
> same origin and port, so there's nothing else to configure — no separate
> frontend/backend URLs, no CORS setup needed.

## Manual Setup (without Docker)

Useful for active development, where you want hot-reload on both the
frontend and backend.

**1. Clone the repository and switch to this branch**
```bash
git clone https://github.com/YOUR_ORG/shacl-nl-interface.git
cd shacl-nl-interface
git checkout feature/demo-code
```

**2. Install the Python project (backend + core)**
```bash
pip install -e .
```

This installs `core/` and `backend/` as importable packages.

For tests, install the optional extras:
```bash
pip install -e ".[dev]"
```

**3. Configure your OpenRouter API key**
```bash
echo "OPENROUTER_API_KEY=sk-or-v1-your-key-here" > backend/.env
```

**4. Install frontend dependencies**
```bash
cd frontend
npm install
echo "VITE_API_BASE=http://localhost:8000" > .env
cd ..
```

## Running the app (manual setup)

In two separate terminals:

```bash
# Terminal 1 — Backend
uvicorn backend.main:app --reload --port 8000
```

```bash
# Terminal 2 — Frontend
cd frontend
npm run dev
```

Then open <http://localhost:5173>.

## Environment Variables

| Variable              | Where it's used                      | Required | Notes                                                                 |
|------------------------|---------------------------------------|----------|------------------------------------------------------------------------|
| `OPENROUTER_API_KEY`   | Backend (`core/llm_client.py`)        | Yes      | Get one at [openrouter.ai](https://openrouter.ai). Without it, the app loads but generation requests fail. |
| `VITE_API_BASE`        | Frontend (build time)                 | No       | Only needed for manual/dev setup, where frontend and backend run on different ports. Leave unset (or empty) for the Docker build, since frontend and backend are served from the same origin. |

## Running tests

```bash
pytest
```

## Acknowledgments

The original SHACL2NL application (frontend, backend, and evaluation
pipeline) was built by Simon Jost and Romit Kheni as part of the TUM
Bachelor Practical Course on Data Engineering (SS 2026). This fork adapts
their work for a live interactive demo and packages it for deployment
with Docker.