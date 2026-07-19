"""Core business logic: SHACL parsing, prompt building, LLM client.

This package is framework-agnostic and contains no FastAPI / Streamlit /
HTTP-server code. It can be imported and reused from:

  - backend/   — FastAPI REST adapter
  - evaluation/ — Batch generation and scoring scripts
  - tests/      — Unit tests
"""
