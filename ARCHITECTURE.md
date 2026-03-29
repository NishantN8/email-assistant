# AI Email Copilot — Architecture & Technical Reference

---

## 1. Product Objective

The AI Email Copilot is a **decision-first intelligent inbox**. Rather than showing emails as a flat list, it acts as a reasoning engine that classifies, prioritises, and generates action directives for every email — replacing the traditional Gmail experience with a system that tells you exactly what to do and why, in priority order.

**Core value proposition:**
- Zero cognitive load — the AI decides what matters and in what order
- One-click action execution — archive, reply, track, or skip without thinking
- Adaptive intelligence — learns your behaviour over time via sender memory graph
- Production-grade reply drafting — 4 AI-crafted reply variants per email, personalised to your writing style

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 (strict) |
| Package manager | pnpm workspaces (monorepo) |
| Frontend framework | React 18 + Vite |
| Styling | TailwindCSS 4 + CSS variables |
| Animations | Framer Motion |
| Server state | TanStack Query v5 |
| Backend framework | Express 5 |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Replit-provisioned) |
| Validation | Zod v4 + drizzle-zod |
| AI (cloud) | OpenAI gpt-4o-mini via Replit AI Integration proxy |
| AI (local) | Ollama (llama3 / mistral / mixtral) via local GPU |
| API client codegen | Orval (from OpenAPI 3.1 spec) |
| Build | esbuild (CJS bundle for API), Vite (ESM for frontend) |
| Auth | Google OAuth 2.0 (Gmail scope) + express-session |
| Email sync | Gmail REST API v1 |
| Deployment | Docker + docker-compose + optional GPU overlay |

---

## 3. Monorepo Structure

```
workspace-root/
├── artifacts/
│   ├── api-server/                 # Express 5 REST API
│   │   └── src/
│   │       ├── app.ts              # Express app factory (middleware + routes)
│   │       ├── index.ts            # Server entrypoint (port binding)
│   │       ├── ai/                 # AI pipeline
│   │       │   ├── engine.ts       # Email classifier (calls router → LLM)
│   │       │   ├── reply.ts        # Reply generator (4 variants, tone profile)
│   │       │   ├── router.ts       # Model tier selector (local vs cloud)
│   │       │   ├── local-llm.ts    # Ollama HTTP client
│   │       │   ├── gpu.ts          # GPU/Ollama availability detector
│   │       │   ├── queue.ts        # In-memory priority queues (local + cloud)
│   │       │   └── index.ts        # Exports routeTask, callLocalLlm
│   │       ├── routes/
│   │       │   ├── emails.ts       # /api/emails/** CRUD + filtering
│   │       │   ├── decisions.ts    # /api/decisions/** AI scoring
│   │       │   ├── replies.ts      # /api/replies/** generation + send
│   │       │   ├── actions.ts      # /api/actions   behaviour logging
│   │       │   ├── sync.ts         # /api/sync/**   Gmail sync trigger
│   │       │   ├── auth.ts         # /api/auth/**   OAuth + session
│   │       │   ├── settings.ts     # /api/settings  tone profile CRUD
│   │       │   ├── ai-status.ts    # /api/ai/status GPU + cache health
│   │       │   ├── health.ts       # /api/health    liveness probe
│   │       │   └── index.ts        # Route aggregator
│   │       └── lib/
│   │           ├── gmail.ts        # Gmail API helper (fetch threads, send)
│   │           ├── hybrid-score.ts # Stage-2 priority formula
│   │           └── sender-memory.ts# importanceScore updater
│   │
│   └── email-copilot/              # React + Vite SPA
│       └── src/
│           ├── App.tsx             # Router (6 routes)
│           ├── pages/
│           │   ├── Inbox.tsx       # Main 3-column inbox (email list + detail)
│           │   ├── Settings.tsx    # AI model + tone + account settings
│           │   ├── Sent.tsx        # Sent mail view
│           │   ├── Archive.tsx     # Archived email view
│           │   ├── Trash.tsx       # Trash view
│           │   └── not-found.tsx   # 404 page
│           ├── components/
│           │   ├── Sidebar.tsx     # Left nav + Gmail connect + sync status
│           │   ├── AiDecisionCard.tsx  # AI banner (action + reason + confidence)
│           │   ├── ReplyBox.tsx    # Reply composer (AI variants + plain text)
│           │   ├── EmailCard.tsx   # Email list item card
│           │   ├── EmailListView.tsx   # Grouped + sorted email list
│           │   ├── EmailBodyRenderer.tsx # HTML/plain email body safe renderer
│           │   ├── ActionStrip.tsx # Keyboard-accessible action toolbar
│           │   ├── SmartStatsBar.tsx   # AI metrics bar (scored, coverage, time saved)
│           │   └── GpuWidget.tsx   # GPU/model status indicator
│           ├── hooks/
│           │   ├── use-emails.ts   # Email action mutations (archive, log)
│           │   ├── use-sender-stats.ts # Sender memory data hook
│           │   └── use-keyboard.ts # j/k/r/e/ESC keyboard navigation
│           └── lib/
│               ├── utils.ts        # cn() + formatTimeAgo()
│               └── api-base.ts     # VITE_API_URL resolver
│
├── lib/
│   ├── db/                         # Drizzle ORM schema + pool
│   │   └── src/
│   │       ├── index.ts            # db export (drizzle + pg Pool)
│   │       └── schema/
│   │           ├── emails.ts
│   │           ├── ai_decisions.ts
│   │           ├── user_actions.ts
│   │           ├── sender_memory.ts
│   │           ├── sync_state.ts
│   │           ├── replies.ts       # replies + user_tone_profiles
│   │           └── users.ts
│   ├── api-spec/                   # OpenAPI 3.1 spec + Orval config
│   ├── api-client-react/           # Auto-generated TanStack Query hooks
│   ├── api-zod/                    # Auto-generated Zod request/response schemas
│   ├── integrations-openai-ai-server/  # OpenAI client via Replit AI proxy (server)
│   └── integrations-openai-ai-react/   # OpenAI client for frontend usage
│
├── scripts/
│   └── src/seed-emails.ts          # Demo data seeder
│
├── docker/
│   ├── docker-compose.yml          # Full production stack
│   ├── docker-compose.gpu.yml      # GPU overlay (NVIDIA runtime)
│   └── nginx.conf                  # Reverse proxy config
│
├── Dockerfile                      # Root image for all services
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

---

## 4. System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                                    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │              React SPA  (email-copilot / Vite)                     │  │
│  │                                                                    │  │
│  │  ┌─────────────┐  ┌───────────────────┐  ┌───────────────────┐   │  │
│  │  │   Sidebar   │  │  EmailListView     │  │  EmailDetailPanel │   │  │
│  │  │  (nav/sync) │  │  (grouped cards)   │  │  (AI banner +     │   │  │
│  │  └─────────────┘  └───────────────────┘  │   ReplyBox)       │   │  │
│  │                                          └───────────────────┘   │  │
│  │          TanStack Query (caching + invalidation)                   │  │
│  └────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────│──────────────────────────────────────────┘
                                │ HTTP / REST
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Express 5 API Server  (:8080)                         │
│                                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐            │
│  │  /emails  │  │/decisions │  │ /replies  │  │ /actions │            │
│  └───────────┘  └───────────┘  └─────┬─────┘  └──────────┘            │
│                                       │                                  │
│                         ┌─────────────▼─────────────────┐              │
│                         │    3-Stage Hybrid AI Pipeline   │              │
│                         │                                 │              │
│  Email arrives ──► Stage 1: Regex rules (instant)         │              │
│                         │  CRITICAL / TRANSACTIONS /      │              │
│                         │  PROMOTIONS / SOCIAL            │              │
│                         ▼                                 │              │
│                    Stage 2: Priority formula (instant)    │              │
│                         │  senderScore×0.25 +            │              │
│                         │  replyRate×0.20 +              │              │
│                         │  openRate×0.15 +               │              │
│                         │  ignoreRate×-0.10 +            │              │
│                         │  urgencyScore×0.25 +           │              │
│                         │  recencyScore×0.15             │              │
│                         │  = priorityScore 0-100         │              │
│                         ▼                                 │              │
│                    Stage 3: LLM reasoning (if score≥55)   │              │
│                         │                                 │              │
│               ┌─────────┴─────────┐                      │              │
│               │   Model Router    │                      │              │
│               │  score<65 → local │                      │              │
│               │  score≥65 → cloud │                      │              │
│               └────┬──────────────┘                      │              │
│                    │                                      │              │
│           ┌────────▼─────────┐  ┌───────────────────┐   │              │
│           │  Ollama (local)  │  │  gpt-4o-mini      │   │              │
│           │  llama3/mistral  │  │  (cloud / Replit  │   │              │
│           │  GPU-accelerated │  │   AI Integration) │   │              │
│           └──────────────────┘  └───────────────────┘   │              │
│                                                           │              │
└───────────────────────────┬───────────────────────────────┘              │
                            │                                               │
                ┌───────────▼──────────┐                                   │
                │    PostgreSQL DB     │◄──────────────────────────────────┘
                │                      │
                │  emails              │
                │  ai_decisions        │
                │  user_actions        │
                │  sender_memory       │
                │  replies             │
                │  user_tone_profiles  │
                │  sync_state          │
                │  users               │
                └──────────────────────┘
                            │
                ┌───────────▼──────────┐
                │   Gmail API v1       │
                │  (OAuth 2.0 sync)    │
                └──────────────────────┘
```

---

## 5. Database Schema

### `emails`
Primary cache of all Gmail messages. AI scores are embedded directly.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| gmail_id | text UNIQUE | Gmail message ID |
| thread_id | text | Gmail thread ID |
| subject | text | Email subject |
| from | text | Display name |
| from_email | text | Sender email address |
| to | text | Recipient |
| snippet | text | 100-char preview |
| body | text | Full email body (HTML or plain) |
| is_read | boolean | Read flag |
| is_starred | boolean | Starred flag |
| labels | jsonb `string[]` | Gmail label array |
| received_at | timestamp | Received time |
| category | text | PRIMARY / CRITICAL / TRANSACTIONS / PROMOTIONS / SOCIAL / LOW_PRIORITY |
| priority_score | integer | 0–100 AI priority score |
| urgency | text | critical / high / medium / low |
| bundled_count | integer | Number of grouped similar emails |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### `ai_decisions`
One record per email. Contains the full AI reasoning output.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| email_id | text | FK → emails.id |
| category | text | Same category enum as emails |
| priority_score | integer | 0–100 |
| urgency | text | critical / high / medium / low |
| recommended_action | text | reply / ignore / archive / track / read_later |
| confidence | real | 0.0–1.0 model confidence |
| reason | text | One-sentence explanation |
| summary | text | 2–3 sentence summary |
| key_points | jsonb `string[]` | Action items extracted from email |
| model_source | text | local / cloud |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### `user_actions`
Behavioural event log. Every open / reply / archive / ignore / override is recorded.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| email_id | text | FK → emails.id |
| from_email | text | Sender email (denormalised for fast sender stats) |
| action | text | open / reply / archive / ignore / trash / spam / mark_unread |
| decision_override | text | If user overrode AI action, the chosen action |
| time_spent_ms | integer | Time user spent reading |
| created_at | timestamp | |

---

### `sender_memory`
Per-sender behavioural model. Updated on every `user_actions` insert. Powers Stage 2 senderScore.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| from_email | text UNIQUE | Sender address |
| display_name | text | Display name |
| total_emails | integer | Total emails from sender |
| open_count | integer | Number opened |
| reply_count | integer | Number replied to |
| ignore_count | integer | Number ignored |
| archive_count | integer | Number archived |
| avg_time_spent_ms | integer | Average reading time |
| last_interaction_at | timestamp | Most recent interaction |
| importance_score | real | 0.0–1.0 — composite importance |
| created_at | timestamp | |
| updated_at | timestamp | |

**Importance formula:**
```
importanceScore = 0.3×openRate + 0.4×replyRate - 0.2×ignoreRate + 0.2×timeBonus
```
Where `timeBonus` = 1 if `avgTimeSpentMs > 30,000`, else 0.

---

### `replies`
Cache of AI-generated reply variants per email.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| email_id | text | FK → emails.id |
| tone | text | professional / friendly / brief / formal |
| content_short | text | Strategic variant |
| content_detailed | text | Concise variant |
| content_friendly | text | Persuasive variant |
| selected_content | text | The variant user actually sent |
| model_used | text | local:llama3 / cloud:gpt-4o-mini |
| is_sent | text | false / true |
| sent_at | timestamp | |
| confidence | real | Generation confidence |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### `user_tone_profiles`
Learns the user's writing style from their edits to AI drafts.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| user_id | text UNIQUE | Session user ID |
| preferred_tone | text | professional / friendly / brief / formal |
| example_replies | jsonb `string[]` | Actual sent replies for few-shot prompting |
| vocabulary_hints | jsonb `string[]` | Words / phrases the user prefers |
| avg_reply_length | text | short / medium / long |
| edit_count | text | Number of AI drafts the user has edited |
| updated_at | timestamp | |

---

### `sync_state`
Tracks Gmail incremental sync position.

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| account_email | text | Authenticated Gmail address |
| history_id | text | Gmail historyId for incremental sync |
| last_synced_at | timestamp | When last sync completed |
| status | text | idle / syncing / error |
| error | text | Last error message if any |

---

### `users`
Authenticated user records (created on first Google OAuth login).

| Column | Type | Description |
|---|---|---|
| id | text PK | UUID |
| email | text UNIQUE | Google account email |
| display_name | text | Google display name |
| picture | text | Profile image URL |
| access_token | text | Gmail OAuth access token |
| refresh_token | text | Gmail OAuth refresh token |
| token_expiry | timestamp | Token expiry for auto-refresh |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## 6. API Reference

All routes are prefixed with `/api`. Authentication uses cookie-based sessions.

### Auth
| Method | Route | Description |
|---|---|---|
| GET | `/auth/google` | Initiate Google OAuth PKCE flow |
| GET | `/auth/google/callback` | OAuth callback — creates session |
| GET | `/auth/me` | Returns current user (null if not authenticated) |
| POST | `/auth/logout` | Destroys session |

### Emails
| Method | Route | Description |
|---|---|---|
| GET | `/emails` | Paginated email list with decisions. Query: `?category=`, `?limit=`, `?offset=`, `?filter=` |
| GET | `/emails/summary` | Counts: needsAction, payments, critical, unread |
| GET | `/emails/inbox-stats` | AI metrics: scored, coverage%, minSaved |
| GET | `/emails/sent` | Sent mail list |
| GET | `/emails/archive` | Archived mail list |
| GET | `/emails/trash` | Trash list |
| GET | `/emails/:id` | Single email + decision + sender stats |
| GET | `/emails/:id/sender` | Sender memory record for this email's sender |
| POST | `/emails/:id/archive` | Archive email (removes from inbox) |

### AI Decisions
| Method | Route | Description |
|---|---|---|
| POST | `/decisions` | Generate/refresh AI decision for `{ emailId }` |
| GET | `/decisions/:emailId` | Get cached decision |
| POST | `/decisions/batch` | Background-score all unscored emails |

### Replies
| Method | Route | Description |
|---|---|---|
| POST | `/replies/generate` | Generate 4 reply variants: `{ emailId, tone, forceRefresh }` |
| GET | `/replies/stream` | SSE streaming generation: `?emailId=&tone=&variant=` |
| POST | `/replies/send` | Send reply via Gmail: `{ emailId, content, replyId }` |
| POST | `/replies/feedback` | Record user's edited reply for tone learning |

### Actions
| Method | Route | Description |
|---|---|---|
| POST | `/actions` | Log user action: `{ emailId, action, decisionOverride?, timeSpentMs? }` |

### Sync
| Method | Route | Description |
|---|---|---|
| POST | `/sync/trigger` | Trigger Gmail sync (returns `{ jobId, status }`) |
| GET | `/sync/status` | Current sync state (idle / syncing / error) |

### AI Status
| Method | Route | Description |
|---|---|---|
| GET | `/ai/status` | Returns GPU availability, Ollama status, queue depth, cache size |

### Settings
| Method | Route | Description |
|---|---|---|
| GET | `/settings/tone` | Get user's tone profile |
| POST | `/settings/tone` | Update tone profile |

---

## 7. AI Pipeline — Deep Dive

### Stage 1 — Regex Rule Classifier (instant)

Fires on every email before any LLM call. Detects known patterns:
- **CRITICAL**: urgent / security / legal / immediate action keywords
- **TRANSACTIONS**: payment / invoice / receipt / order patterns
- **PROMOTIONS**: marketing sender patterns, unsubscribe links
- **SOCIAL**: social network notifications

If Stage 1 matches CRITICAL → skip to Stage 3 immediately regardless of score.

---

### Stage 2 — Weighted Priority Formula (instant)

Runs on every email after Stage 1 if not CRITICAL. Produces `priorityScore` 0–100:

```
priorityScore =
  senderScore    × 0.25   (from sender_memory.importanceScore)
+ replyRate      × 0.20   (sender's historical reply rate with user)
+ openRate       × 0.15   (sender's historical open rate)
+ ignoreRate     × -0.10  (penalty for frequently ignored sender)
+ urgencyScore   × 0.25   (derived from subject/snippet keywords)
+ recencyScore   × 0.15   (exponential decay on email age)
```

All inputs are normalised to 0.0–1.0 before weighting.

---

### Stage 3 — LLM Deep Reasoning (conditional)

Triggered when: `priorityScore ≥ 55` **OR** `category === CRITICAL`

**Model Router Decision Tree:**
```
forceCloud? → cloud:gpt-4o-mini
priorityScore ≥ 65? → cloud:gpt-4o-mini
task = "deep-reasoning" or "reply-generation"? → cloud:gpt-4o-mini
Ollama available? No → cloud:gpt-4o-mini
GPU utilisation > 90%? → cloud:gpt-4o-mini (with local fallback)
GPU free memory < 15%? → cloud:gpt-4o-mini (with local fallback)
Otherwise → local:Ollama (llama3 / mistral / mixtral)
```

**Output from Stage 3 (all fields):**
```json
{
  "category": "PRIMARY",
  "priorityScore": 87,
  "urgency": "high",
  "recommendedAction": "reply",
  "confidence": 0.91,
  "reason": "Investor requesting Q1 metrics — high stakes relationship",
  "summary": "...",
  "keyPoints": ["Send Q1 deck", "Confirm meeting time"]
}
```

---

### Reply Engine (4 variants)

Called via `POST /replies/generate`. Always routes to `cloud:gpt-4o-mini`.

**Variant types:**
| Variant | Style | Best for |
|---|---|---|
| Strategic | Outcome-maximising, assertive | High-stakes business email |
| Concise | Short, direct, no filler | Busy senders, action items |
| Persuasive | Influence-focused, evidence-backed | Negotiation, approval requests |
| Relationship | Warm, rapport-building | Colleagues, long-term contacts |

**Tone injection:** User's `user_tone_profiles` record is injected into the system prompt as few-shot examples, so generated replies match the user's real writing style.

**Streaming:** `GET /replies/stream` sends SSE `token` events as text arrives, then a `done` event with model info.

---

## 8. Sender Memory Graph

Every user action updates `sender_memory` for that sender:

```
open    → openCount++
reply   → replyCount++
ignore  → ignoreCount++
archive → archiveCount++

importanceScore = 0.3×(openCount/totalEmails)
                + 0.4×(replyCount/totalEmails)
                - 0.2×(ignoreCount/totalEmails)
                + 0.2×timeBonus
```

This `importanceScore` is the `senderScore` fed into Stage 2's priority formula. The system gets smarter with every interaction, automatically deprioritising senders you always ignore and boosting ones you always engage with.

---

## 9. Frontend Architecture

### Routes
| Path | Page | Description |
|---|---|---|
| `/` | Inbox | Main 3-column inbox view |
| `/sent` | Sent | Sent mail |
| `/archive` | Archive | Archived mail |
| `/trash` | Trash | Trash |
| `/settings` | Settings | AI model + tone + account |
| `*` | Not Found | 404 |

### Inbox Layout (3-column)

```
┌──────────────────────────────────────────────────────────────────┐
│  SIDEBAR         │  EMAIL LIST           │  EMAIL DETAIL         │
│  (240px fixed)   │  (380px fixed)        │  (flex-1 remaining)   │
│                  │                       │                       │
│  • Smart Inbox   │  📊 Smart Stats Bar   │  AI Decision Banner   │
│  • Sent          │  🔥 Priority          │   ↳ action + reason   │
│  • Archive       │  ⚡ Needs Action      │   ↳ confidence bar    │
│  • Trash         │  📥 Updates           │   ↳ key points        │
│  • Settings      │  🧠 Low Priority      │                       │
│                  │                       │  Reply Box            │
│  Sync Status     │  [email cards]        │   ↳ AI variants       │
│  Connect Gmail   │  [bundled groups]     │   ↳ plain text        │
└──────────────────────────────────────────────────────────────────┘
```

### Email Card
Each card shows: sender avatar, sender name, subject, timestamp, priority score badge, AI decision reason, action pills.

### AI Decision Banner (EmailDetailPanel)
The top section of every opened email. Shows:
- AI recommended action in large type: **↩ REPLY / 📦 ARCHIVE / 🔇 IGNORE / 👁 READ LATER**
- Urgency badge (CRITICAL / HIGH / MEDIUM / LOW)
- Cloud vs GPU model badge
- Confidence percentage
- One-line reason
- Animated confidence bar
- Primary action button (specific to action type)

### Reply Buttons
- **Reply with AI** → opens `ReplyBox` in AI mode, auto-generates 4 variants immediately
- **Write Reply** → opens `ReplyBox` in plain text mode (simple textarea + Send)

### Keyboard Shortcuts
| Key | Action |
|---|---|
| `j` | Next email |
| `k` | Previous email |
| `r` | Toggle reply box |
| `e` | Archive email |
| `ESC` | Close detail / close reply |
| `?` | Show shortcut legend |

---

## 10. Authentication & Gmail Sync

### Auth Flow
1. User clicks **Connect Gmail** in sidebar
2. Browser redirects to `GET /api/auth/google`
3. Server initiates Google OAuth 2.0 PKCE with scopes: `gmail.readonly gmail.send profile email`
4. Google redirects to `GET /api/auth/google/callback`
5. Server exchanges code for `access_token` + `refresh_token`
6. Tokens stored in `users` table, session created with `userId`
7. Frontend polls `GET /api/auth/me` to detect auth state

### Sync Flow
1. Frontend calls `POST /api/sync/trigger`
2. Server calls Gmail API `users.messages.list` with `historyId` for incremental updates
3. New messages fetched, stored in `emails` table
4. Background job queues AI scoring for new emails via `POST /decisions/batch`
5. `sync_state` updated with new `historyId`
6. TanStack Query invalidates `emails` and `summary` queries on completion

---

## 11. Settings Page

**AI Model Routing** — Control when local vs cloud AI is used:
- Hybrid Mode (default): local for low priority, cloud for high priority
- Cloud Only: always use gpt-4o-mini
- Local Only: always use Ollama (requires GPU)
- Local First: prefer local, fall back to cloud

**Tone Profile** — Set your writing style:
- Tone preference: Professional / Friendly / Brief / Formal
- Average reply length: Short / Medium / Long
- The system learns from your edits and improves over time

**Account** — Gmail connection status, re-authorise, disconnect.

---

## 12. Docker / Production Deployment

### Services (docker-compose.yml)
| Service | Image | Port | Description |
|---|---|---|---|
| postgres | postgres:16-pgvector | 5432 | Primary database with pgvector extension |
| redis | redis:7-alpine | 6379 | Session store + job queue cache |
| ollama | ollama/ollama | 11434 | Local LLM server |
| api | workspace/api | 8080 | Express API server |
| frontend | workspace/frontend | 3000 | Vite preview server |
| nginx | nginx:alpine | 80/443 | Reverse proxy + TLS termination |

### GPU Overlay (docker-compose.gpu.yml)
Extends the base compose file to add NVIDIA GPU runtime to the `ollama` service:
```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

### Start Commands
```bash
# CPU-only
docker compose up -d

# With NVIDIA GPU
docker compose -f docker-compose.yml -f docker/docker-compose.gpu.yml up -d

# Pull GPU model
docker exec -it ollama ollama pull llama3
```

---

## 13. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session signing secret |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto | Replit AI proxy base URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto | Replit AI proxy key |
| `OLLAMA_HOST` | Optional | Ollama endpoint (default: http://localhost:11434) |
| `PORT` | Optional | API server port (default: 8080) |
| `VITE_API_URL` | Optional | Frontend: API base URL (default: same origin) |
| `NODE_ENV` | Optional | development / production |

---

## 14. Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Run API server (dev with hot reload)
pnpm --filter @workspace/api-server run dev

# Run frontend (dev with HMR)
pnpm --filter @workspace/email-copilot run dev

# Push DB schema changes (safe upsert, no destructive drops)
pnpm --filter @workspace/db run push

# Regenerate API client + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Seed demo emails (500 realistic emails with AI decisions)
pnpm --filter @workspace/scripts run seed-emails

# Build API for production
pnpm --filter @workspace/api-server run build

# Build frontend for production
pnpm --filter @workspace/email-copilot run build
```

---

## 15. Data Flow — End to End

```
Gmail sync
   │
   ▼
emails table (raw)
   │
   ▼
Stage 1: Regex rules → category assigned
   │
   ▼
Stage 2: Priority formula → priorityScore 0-100
   │  ← senderScore from sender_memory
   │
   ├─ score < 55 → store in ai_decisions (no LLM needed)
   │
   └─ score ≥ 55 ──► Model Router
                          │
                 ┌────────┴────────┐
            score < 65         score ≥ 65
                 │                  │
            Ollama GPU          gpt-4o-mini
                 │                  │
                 └────────┬─────────┘
                          │
                          ▼
                   ai_decisions (full reasoning output)
                          │
                          ▼
                   Frontend renders AI Decision Banner
                          │
                   User clicks action
                          │
                          ▼
                   user_actions (event log)
                          │
                          ▼
                   sender_memory updated
                          │
                          ▼
                   importanceScore recalculated
                          │
                          ▼
                   Next email from same sender gets better score
```

---

*Last updated: March 2026 — AI Email Copilot v1.0*
