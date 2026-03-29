# AI Email Copilot — Docker GPU Stack

## Quick Start

```bash
# 1. Copy env template and fill in secrets
cp .env.docker .env
# edit .env: set SESSION_SECRET, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY

# 2. CPU mode (Ollama pulls llama3:8b + mistral:7b automatically)
./docker/deploy.sh

# 3. GPU mode — requires NVIDIA Container Toolkit
./docker/deploy.sh --gpu
```

## Architecture

```
nginx :80
 ├── /         → frontend :3000  (Vite/React)
 └── /api/     → api-server :8080 (Node.js)
                    │
                    ├── postgres :5432 (pgvector)
                    ├── redis :6379    (queue + cache)
                    ├── ollama :11434  (local LLM fallback)
                    └── vllm :8000     (GPU primary, --gpu only)

bullmq-worker (background)
 ├── local-ai-queue  → vLLM → Ollama → cloud fallback
 ├── cloud-ai-queue  → OpenAI gpt-4o-mini → local fallback
 └── embedding-jobs  → vLLM → text-embedding-3-small
```

## Services

| Service  | Image                       | Port  | Purpose                        |
|----------|-----------------------------|-------|--------------------------------|
| postgres | pgvector/pgvector:pg16      | 5432  | Database + vector embeddings   |
| redis    | redis:7-alpine              | 6379  | BullMQ queues + response cache |
| ollama   | ollama/ollama:latest        | 11434 | Local LLM (CPU/GPU)            |
| vllm     | vllm/vllm-openai:latest     | 8000  | GPU-accelerated LLM (--gpu)    |
| api      | (built from source)         | 8080  | Express API + decision engine  |
| worker   | (built from source)         | —     | BullMQ job processor           |
| frontend | (built from source)         | 3000  | Vite/React SPA                 |
| nginx    | nginx:alpine                | 80    | Reverse proxy                  |

## GPU Requirements

- NVIDIA GPU (Turing / Ampere / Ada recommended: RTX 3090, A100, H100)
- CUDA 12.x driver on host
- NVIDIA Container Toolkit installed
- 8GB+ VRAM for Mistral 7B, 16GB+ for Llama 3 8B

### Install NVIDIA Container Toolkit (Ubuntu)

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Verify: `docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi`

## Environment Variables

Copy `.env.docker` → `.env` and fill in:

| Variable             | Required | Description                          |
|----------------------|----------|--------------------------------------|
| SESSION_SECRET       | YES      | Express session secret (32+ chars)   |
| GOOGLE_CLIENT_SECRET | YES      | Google OAuth client secret           |
| OPENAI_API_KEY       | NO       | Cloud fallback (omit = local-only)   |
| HF_TOKEN             | NO       | HuggingFace token for gated models   |
| VLLM_MODEL           | NO       | Model to serve via vLLM              |
| OLLAMA_MODELS        | NO       | Space-separated models to pull       |

## Commands

```bash
./docker/deploy.sh            # Start (CPU)
./docker/deploy.sh --gpu      # Start (GPU)
./docker/deploy.sh --build    # Rebuild images and start
./docker/deploy.sh --logs     # Tail all logs
./docker/deploy.sh --status   # Container health
./docker/deploy.sh --down     # Stop everything
```

## AI Status Endpoint

Once running: `curl http://localhost:8080/api/ai/status`

Shows: GPU availability, local LLM models, queue depths, cache stats, routing config.
