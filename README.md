# AI Email Copilot

A production-grade, decision-first intelligent inbox — Superhuman-quality UI with a 3-stage hybrid AI pipeline (local GPU + cloud fallback), 5-agent swarm analysis, smart cleanup engine, reply strategist, and full Gmail OAuth sync.

---

## Features at a Glance

| Feature | Description |
|---|---|
| **Gmail OAuth Sync** | Real-time Gmail sync via Google OAuth 2.0; background polling every 5 minutes |
| **3-Stage AI Pipeline** | Classify → Deep Reason → Swarm analysis; local-first with cloud fallback |
| **5-Agent Swarm** | Intent · Urgency · Tone · Action · Reply Quality Critic run in parallel |
| **3-Column UI** | Sidebar · Email list · AI detail panel — Superhuman-grade keyboard-driven |
| **AI Reply Strategist** | 4 reply variants (Direct / Diplomatic / Brief / Detailed) per email |
| **Smart Cleanup Engine** | Heuristic scorer finds newsletters, promotions, spam; bulk Archive / Trash / Spam |
| **Action Feed** | Auto-generated task queue from inbox with priority scoring |
| **Sender Memory** | Strategy memory graph tracks tone/style preferences per sender |
| **Keyboard Shortcuts** | `j/k` navigate · `r` reply · `e` archive · `Escape` close |
| **Circuit Breakers** | Per-provider breakers with half-open probing and adaptive cloud ordering |
| **GPU / CUDA Support** | RTX 3080-optimised model profiles; CUDA auto-detection via nvidia-smi |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Ollama (optional, for local GPU inference)

### 1. Clone & install

```bash
git clone https://github.com/NishantN8/email-assistant.git
cd email-assistant
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/email_copilot
SESSION_SECRET=your-random-secret-here

# Google OAuth (see docs/SETUP.md for how to get these)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback

# Optional: cloud AI fallback providers
GROQ_API_KEY=
GOOGLE_AI_API_KEY=
MISTRAL_API_KEY=
OPENROUTER_API_KEY=
OPENAI_API_KEY=
```

### 3. Set up the database

```bash
pnpm --filter @workspace/db run push
```

### 4. Start development servers

```bash
# Terminal 1 — API server (port 3001)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 5173)
pnpm --filter @workspace/email-copilot run dev
```

Open `http://localhost:5173` and connect your Gmail account.

---

## Monorepo Structure

```
email-assistant/
├── artifacts/
│   ├── api-server/          # Express + TypeScript API
│   │   └── src/
│   │       ├── ai/          # AI pipeline (engine, swarm, router, circuit breaker)
│   │       ├── routes/      # REST API endpoints
│   │       └── services/    # Business logic services
│   └── email-copilot/       # React + Vite frontend
│       └── src/
│           ├── components/  # UI components
│           └── pages/       # Page-level components
├── lib/
│   ├── db/                  # Drizzle ORM schema + migrations
│   ├── api-zod/             # Shared Zod validation schemas
│   └── api-client-react/    # React Query API client
└── docs/                    # Full documentation
```

---

## Documentation

| Doc | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, AI pipeline, data flow |
| [API Reference](docs/API.md) | All REST endpoints with request/response schemas |
| [Setup Guide](docs/SETUP.md) | Detailed local dev + Docker GPU deployment |
| [Features Guide](docs/FEATURES.md) | User-facing feature walkthrough |

---

## Tech Stack

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui · Framer Motion · TanStack Query

**Backend:** Node.js · Express · TypeScript · Drizzle ORM · PostgreSQL

**AI:** Ollama (local LLM) · Groq · Google Gemini · Mistral · OpenRouter · OpenAI (fallback chain)

**Infrastructure:** Circuit breakers · Event-driven queues · Adaptive provider routing · CUDA/GPU detection

---

## License

MIT
