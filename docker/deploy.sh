#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# AI Email Copilot — Docker deployment helper
# ─────────────────────────────────────────────────────────────────
# Usage:
#   ./docker/deploy.sh          — CPU mode (Ollama fallback)
#   ./docker/deploy.sh --gpu    — GPU mode (vLLM + Ollama)
#   ./docker/deploy.sh --down   — stop everything
#   ./docker/deploy.sh --logs   — tail all logs
#   ./docker/deploy.sh --status — show container status
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

GPU=false
CMD="up -d"

for arg in "$@"; do
  case $arg in
    --gpu)    GPU=true ;;
    --down)   CMD="down" ;;
    --logs)   CMD="logs -f --tail=100" ;;
    --status) CMD="ps" ;;
    --pull)   CMD="pull" ;;
    --build)  CMD="up -d --build" ;;
  esac
done

# Ensure .env exists
if [ ! -f ".env" ] && [ "$CMD" != "down" ]; then
  echo "⚠  No .env file found. Copying from .env.docker..."
  cp .env.docker .env
  echo "📝 Edit .env and set your secrets, then re-run this script."
  exit 1
fi

if [ "$GPU" = "true" ]; then
  # Check NVIDIA Container Toolkit
  if ! docker info 2>/dev/null | grep -q "nvidia"; then
    echo "⚠  NVIDIA Container Toolkit not detected."
    echo "   Install from: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
    echo "   Falling back to CPU mode..."
    GPU=false
  fi
fi

COMPOSE_FILES="-f docker-compose.yml"
if [ "$GPU" = "true" ]; then
  COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.gpu.yml"
  echo "🚀 Starting in GPU mode (vLLM + Ollama + CUDA)..."
else
  echo "🚀 Starting in CPU mode (Ollama fallback)..."
fi

# shellcheck disable=SC2086
docker compose $COMPOSE_FILES $CMD

if [ "$CMD" = "up -d" ] || [ "$CMD" = "up -d --build" ]; then
  echo ""
  echo "✅ Services starting..."
  echo ""
  echo "  Frontend:  http://localhost:3000"
  echo "  API:       http://localhost:8080"
  echo "  Ollama:    http://localhost:11434"
  if [ "$GPU" = "true" ]; then
    echo "  vLLM:      http://localhost:8000"
  fi
  echo "  Postgres:  localhost:5432"
  echo "  Redis:     localhost:6379"
  echo ""
  echo "  AI Status: http://localhost:8080/api/ai/status"
  echo ""
  echo "Run './docker/deploy.sh --logs' to tail all container logs."
fi
