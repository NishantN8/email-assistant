# Setup Guide

---

## Local Development

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| pnpm | 9+ |
| PostgreSQL | 15+ |
| Ollama | latest (optional, for local GPU inference) |

### Step 1 — Clone and install

```bash
git clone https://github.com/NishantN8/email-assistant.git
cd email-assistant
pnpm install
```

### Step 2 — Set up PostgreSQL

```bash
# macOS (Homebrew)
brew install postgresql@15
brew services start postgresql@15
createdb email_copilot

# Ubuntu/Debian
sudo apt install postgresql-15
sudo -u postgres createdb email_copilot
```

### Step 3 — Configure environment variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/email_copilot

# Sessions
SESSION_SECRET=your-random-secret-minimum-32-chars

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback

# Optional: Cloud AI fallback providers (add as many as you want)
GROQ_API_KEY=
GOOGLE_AI_API_KEY=
MISTRAL_API_KEY=
OPENROUTER_API_KEY=
OPENAI_API_KEY=
```

### Step 4 — Set up Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Library** and enable:
   - **Gmail API**
   - **Google People API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
7. Copy the **Client ID** and **Client Secret** into `.env`

### Step 5 — Push database schema

```bash
pnpm --filter @workspace/db run push
```

### Step 6 — Start development servers

Open two terminals:

```bash
# Terminal 1 — API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend
pnpm --filter @workspace/email-copilot run dev
```

The frontend will be at `http://localhost:5173`. The API server listens on `http://localhost:3001`.

---

## Setting Up Ollama (Local GPU Inference)

Ollama runs LLMs locally on your GPU. This is optional — the app works with cloud providers only.

### Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download
```

### Pull models

For RTX 3080 (10GB VRAM) — recommended models:

```bash
ollama pull llama3.1:8b     # Best quality/speed balance
ollama pull mistral:7b       # Fast, excellent for email
ollama pull phi3:mini        # Lightest, fastest
```

For cards with < 8GB VRAM:

```bash
ollama pull llama3.2:3b     # Only needs ~2.5GB
```

### Verify Ollama is running

```bash
curl http://localhost:11434/api/tags
# Should list your pulled models
```

The API server auto-discovers models at startup. No manual configuration needed.

### CUDA / NVIDIA GPU configuration

Set these environment variables for optimal performance:

```env
CUDA_VISIBLE_DEVICES=0
OLLAMA_NUM_GPU_LAYERS=35      # RTX 3080 recommended
OLLAMA_GPU_MEMORY_FRACTION=0.90
```

These are set automatically when the API server detects a CUDA device via `nvidia-smi`.

---

## Docker Deployment (GPU-Enabled)

### Prerequisites

- Docker 24+
- NVIDIA Container Toolkit (for GPU support)

### Install NVIDIA Container Toolkit

```bash
# Ubuntu
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Build and run with Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: email_copilot
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - NVIDIA_VISIBLE_DEVICES=all

  api-server:
    build:
      context: .
      dockerfile: artifacts/api-server/Dockerfile
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/email_copilot
      OLLAMA_HOST: http://ollama:11434
      SESSION_SECRET: ${SESSION_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GOOGLE_REDIRECT_URI: ${GOOGLE_REDIRECT_URI}
    depends_on:
      - postgres
      - ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  frontend:
    build:
      context: .
      dockerfile: artifacts/email-copilot/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - api-server

volumes:
  pgdata:
  ollama_data:
```

```bash
# Start everything
docker compose up -d

# Pull a model into the Ollama container
docker compose exec ollama ollama pull llama3.1:8b

# Run database migrations
docker compose exec api-server pnpm --filter @workspace/db run push
```

The app will be available at `http://localhost`.

### Healthcheck

```bash
curl http://localhost:3001/healthz
```

Expected response when everything is healthy:

```json
{
  "status": "ok",
  "checks": {
    "db": { "ok": true },
    "llm": { "ok": true },
    "gpu": { "ok": true },
    "queue": { "ok": true }
  }
}
```

---

## Production Checklist

- [ ] `SESSION_SECRET` is at least 32 random characters
- [ ] PostgreSQL runs on a separate host with SSL enabled
- [ ] Google OAuth redirect URI matches your production domain
- [ ] At least one cloud AI provider key is set (Groq is free and fast)
- [ ] Ollama is accessible from the API server (check firewall rules)
- [ ] `/healthz` returns `"status": "ok"` before routing traffic
- [ ] Monitor `/api/metrics` — watch `fallback_rate` and `circuit_breakers`

---

## Useful Commands

```bash
# Install all dependencies
pnpm install

# Push DB schema changes
pnpm --filter @workspace/db run push

# Build all packages
pnpm build

# Run API server in dev mode
pnpm --filter @workspace/api-server run dev

# Run frontend in dev mode
pnpm --filter @workspace/email-copilot run dev

# Type-check everything
pnpm typecheck

# Check Ollama models
curl http://localhost:11434/api/tags | jq '.models[].name'
```
