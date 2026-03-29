#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Ollama entrypoint — starts server, then pulls models
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# Models to pull at startup (space-separated, override via env)
MODELS_TO_PULL="${OLLAMA_MODELS:-llama3:8b mistral:7b}"

echo "[ollama] Starting Ollama server..."
ollama serve &
SERVER_PID=$!

echo "[ollama] Waiting for server to be ready..."
max_wait=120
waited=0
until curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; do
  if [ $waited -ge $max_wait ]; then
    echo "[ollama] ERROR: Server did not start within ${max_wait}s"
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

echo "[ollama] Server ready. Pulling models: ${MODELS_TO_PULL}"

for model in $MODELS_TO_PULL; do
  echo "[ollama] Pulling model: ${model}"
  if ollama pull "$model"; then
    echo "[ollama] Model ${model} ready"
  else
    echo "[ollama] WARNING: Failed to pull ${model}, skipping"
  fi
done

echo "[ollama] All models loaded. Ready for inference."

# Keep the server running
wait $SERVER_PID
