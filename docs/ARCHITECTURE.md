# Architecture

## Overview

The AI Email Copilot is a full-stack TypeScript monorepo with a clear separation between the React frontend, Express API server, and shared libraries. The AI pipeline is the core differentiator — every email is processed through a multi-stage, multi-model system before the user sees it.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React + Vite)                       │
│  Sidebar │ Email List (AI-sorted) │ AI Decision Panel + Reply Box   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ REST / JSON
┌──────────────────────────▼──────────────────────────────────────────┐
│                     Express API Server                              │
│                                                                     │
│  ┌─────────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Gmail OAuth │  │  Emails   │  │  Tasks   │  │    Cleanup    │  │
│  │    /auth    │  │  /emails  │  │  /tasks  │  │   /cleanup    │  │
│  └─────────────┘  └───────────┘  └──────────┘  └───────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     AI Pipeline                              │  │
│  │                                                              │  │
│  │  Router → classify/deepReason/reply                         │  │
│  │      ↓                                                       │  │
│  │  Local Queue ──► Ollama (GPU)                               │  │
│  │      │                │                                      │  │
│  │      │   (fail/slow)  │                                      │  │
│  │      └──► Cloud Queue ──► Groq → Gemini → Mistral → OpenAI  │  │
│  │                                                              │  │
│  │  Swarm Agents (parallel):                                    │  │
│  │    Intent · Urgency · Tone · Action · Reply Quality Critic   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────┐  ┌────────────────┐  ┌───────────────────────┐   │
│  │  PostgreSQL │  │  Redis-style   │  │  Circuit Breakers +   │   │
│  │   (Drizzle) │  │  Event Queues  │  │  Adaptive Routing     │   │
│  └─────────────┘  └────────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## AI Pipeline — 3 Stages

### Stage 1: Classification

Every new email enters the **classify** queue. The AI router decides whether to use local (Ollama) or cloud based on:

- GPU availability and VRAM headroom
- Queue depth of local vs. cloud queues
- Circuit breaker state for each provider
- Email complexity (token estimate)

Output: `category`, `priority_score (0-100)`, `action`, `confidence`, `reason`.

### Stage 2: Deep Reasoning

Emails with `priority_score >= 50` are re-processed through **deepReason** — a more detailed prompt that extracts:

- Deadlines and time-sensitivity
- Required response type
- Sentiment and tone
- Actionable next steps

### Stage 3: Swarm Analysis

High-priority emails (`priority_score > 40`) additionally run through the **swarm** — five specialist agents executing in parallel via `Promise.all`:

| Agent | Role |
|---|---|
| **Intent Agent** | Determines the sender's true goal |
| **Urgency Agent** | Scores time pressure 0–100 |
| **Tone Agent** | Detects sentiment (hostile/neutral/friendly) |
| **Action Agent** | Extracts specific required actions |
| **Reply Quality Critic** | Evaluates whether a reply is needed |

**Swarm tiers** (to avoid over-spending compute):

| Score | Tier | Agents |
|---|---|---|
| ≤ 40 | `none` | Skipped |
| 41–70 | `reduced` | Intent + Urgency + Action |
| > 70 | `full` | All 5 agents |

---

## AI Router & Model Selection

`artifacts/api-server/src/ai/router.ts`

The router selects the best available model based on quality scores stored in the `model_profiles` table. At startup, Ollama is queried for available models via `/api/tags` — any discovered model is auto-registered with sensible VRAM estimates.

RTX 3080 optimised defaults (seeded on startup):

| Model | VRAM |
|---|---|
| llama3.1:8b | 5500 MB |
| deepseek-r1:7b | 5500 MB |
| mistral:7b | 4800 MB |
| qwen2.5:7b | 5000 MB |
| phi3:mini | 3000 MB |
| llama3.2:3b | 2500 MB |

---

## Cloud Provider Fallback Chain

`artifacts/api-server/src/ai/cloud-providers.ts`

Providers are tried in adaptive order based on a rolling 5-minute performance window:

```
Groq (llama-4-maverick)
  → Google Gemini 2.5 Flash
    → Mistral Large
      → OpenRouter (mistral-7b:free)
        → OpenAI gpt-4o-mini  ← last resort
```

If a provider's API key is not set, it is silently skipped. The adaptive sorter (`provider-stats.ts`) re-orders providers by `compositeScore = successRate / avgLatencyMs` after enough samples (min 3 in the window).

---

## Circuit Breakers

`artifacts/api-server/src/ai/circuit-breaker.ts`

Each provider (local Ollama + each cloud provider) has its own `CircuitBreaker` instance.

| Provider | Trip Threshold | Recovery Window |
|---|---|---|
| local:ollama | 8,000 ms | 30 s |
| cloud providers | 12,000 ms | 30 s |

**States:**

- **Closed** — normal operation
- **Open** — all requests fail-fast (provider is down)
- **Half-open** — one probe request is allowed; success → closed, failure → re-opens immediately. The `_probing` flag ensures only one probe passes through.

**Trip conditions (rolling 60s window):**
- p95 latency > threshold, OR
- error rate > 50% with at least 3 samples

---

## Event-Driven Queue

`artifacts/api-server/src/ai/queue.ts`

Two queues: `localAiQueue` and `cloudAiQueue`. Each queue:

- Has a configurable `maxDepth` (default 200) — exceeding it throws `QueueFullError` → HTTP 503
- Uses `EventEmitter` instead of `setInterval` polling — resolves immediately on `job:completed`
- Maintains a DLQ ring buffer (last 100 exhausted-retry jobs)
- Tracks `last_progress_ms` for stall detection (5-minute threshold in `/healthz`)

---

## Response Cache

`artifacts/api-server/src/ai/engine.ts`

In-memory LRU cache (max 1000 entries, 1-hour TTL) keyed by `task:emailId`. Avoids re-running AI on emails that have already been scored. Cache stats are exposed in `/api/metrics`.

---

## Database Schema

`lib/db/src/schema.ts`

| Table | Purpose |
|---|---|
| `emails` | All synced emails with metadata and AI scores |
| `ai_decisions` | Detailed AI output per email (swarm results, deep reason) |
| `tasks` | Action items auto-generated from inbox |
| `user_actions` | Cleanup actions log (for learning loop) |
| `outcome_signals` | User feedback used to improve future prioritisation |
| `model_profiles` | Registered LLM models with VRAM and quality scores |
| `settings` | Per-user configuration (OAuth tokens, sync preferences) |

---

## Gmail Sync

`artifacts/api-server/src/routes/sync.ts`

- OAuth 2.0 PKCE flow via Google
- Tokens stored encrypted in `settings` table
- Background sync polls every 5 minutes via `setInterval` on server startup
- Fetches inbox delta using `history.list` API — only new messages since last `historyId`
- New emails are immediately queued for AI classification

---

## Smart Cleanup Engine

`artifacts/api-server/src/services/spamHeuristic.ts`

Scores every email across 12+ signals without AI (pure heuristics):

- Gmail category labels (PROMOTIONS, FORUMS, SOCIAL)
- Promotional keyword density (sale, offer, % off, unsubscribe, etc.)
- Unsubscribe link presence
- Link-to-text ratio
- HTML image count
- Sender domain trust (known newsletter domains → lower trust)
- User interaction history (opened, replied, archived)
- Days since last interaction

Score 0–100; candidates with score > 60 are surfaced in the cleanup panel.

---

## Sender Memory Graph

`artifacts/api-server/src/services/strategyMemory.ts`

Tracks per-sender communication patterns:

- Preferred reply tone (Direct / Diplomatic / Brief / Detailed)
- Average response time
- Historical reply rate
- Last interaction timestamp

Used to personalise the AI reply strategist's default tone selection.
