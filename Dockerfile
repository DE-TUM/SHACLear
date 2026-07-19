# ---------- Stage 1: build the frontend ----------
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

# Install deps first so this layer is cached unless package*.json changes
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# Frontend and backend are served from the same origin in production, so
# leave VITE_API_BASE empty -> the app calls relative paths like
# "/api/generate", which hit this same container's FastAPI app.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# ---------- Stage 2: backend + serve the built frontend ----------
FROM python:3.11-slim
WORKDIR /app

COPY pyproject.toml README.md ./
COPY core/ ./core/
COPY backend/ ./backend/

RUN pip install --no-cache-dir -e .

# Built frontend assets, served as static files by FastAPI (see main.py)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 80

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "80"]
