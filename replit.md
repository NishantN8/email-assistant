# AI Email Copilot

## Overview

A production-grade AI email copilot system that functions as a decision engine. It classifies, prioritizes, and suggests actions for every email using AI — not just keyword matching. The UI is decision-first, replacing traditional Gmail-style tabs with 4 intelligent sections.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 18 + Vite, TailwindCSS, TanStack Query, Framer Motion
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI gpt-5-mini via Replit AI Integrations (no user API key needed)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (emails, decisions, actions, sync)
│   └── email-copilot/      # React frontend (inbox, email detail, AI decision cards)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/  # OpenAI AI integration
├── scripts/
│   └── src/seed-emails.ts  # Seed demo email data
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

- `emails` — Email cache with AI classification (category, priorityScore, urgency)
- `ai_decisions` — AI decisions per email (recommendedAction, confidence, reason, summary, keyPoints)
- `user_actions` — Behavior log (open, reply, ignore, archive, override)
- `sender_memory` — Per-sender behavioral statistics for adaptive scoring
- `sync_state` — Gmail sync state tracking

## API Endpoints

All routes under `/api`:

- `GET /api/emails` — Returns paginated email list with decisions, filterable by category
- `GET /api/emails/summary` — Returns inbox action counts (needsAction, payments, critical, unread)
- `GET /api/emails/:id` — Returns single email with AI decision
- `POST /api/decisions` — Generate/refresh AI decision for an email
- `GET /api/decisions/:emailId` — Get cached AI decision
- `POST /api/actions` — Log user action + update sender memory
- `POST /api/sync/trigger` — Trigger email sync
- `GET /api/sync/status` — Current sync status

## AI Decision Engine

For each email, generates:
- `category`: PRIMARY | CRITICAL | TRANSACTIONS | PROMOTIONS | SOCIAL | LOW_PRIORITY
- `priorityScore`: 0-100
- `urgency`: critical | high | medium | low
- `recommendedAction`: reply | ignore | archive | track | read_later
- `confidence`: 0-1
- `reason`: concise explanation
- `summary`: 2-3 sentence summary
- `keyPoints`: array of key action items

## UI Sections

1. 🔥 **Priority** — High urgency emails (priorityScore 70+)
2. ⚡ **Needs Action** — Emails requiring reply/follow-up
3. 📥 **Updates** — Transactions, notifications, newsletters
4. 🧠 **Low Priority** — Everything else, collapsed by default

## Seeding Demo Data

```bash
pnpm --filter @workspace/scripts run seed-emails
```

## Development

```bash
# Run API server
pnpm --filter @workspace/api-server run dev

# Run frontend
pnpm --filter @workspace/email-copilot run dev

# Regenerate API client from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes
pnpm --filter @workspace/db run push
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Replit AI proxy URL (auto-provisioned)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI key (auto-provisioned)
- `SESSION_SECRET` — Session secret for auth
