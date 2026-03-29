# API Reference

Base URL: `http://localhost:3001/api`

All endpoints return JSON. Authentication uses session cookies established via the Gmail OAuth flow.

---

## Authentication

### `GET /api/auth/google`
Initiates Gmail OAuth 2.0 PKCE flow. Redirects the browser to Google's consent screen.

### `GET /api/auth/google/callback`
OAuth callback. Exchanges the auth code for tokens, stores them, and redirects to the frontend.

### `GET /api/auth/status`
Returns the current auth state.

**Response:**
```json
{
  "connected": true,
  "email": "user@gmail.com",
  "displayName": "User Name"
}
```

### `POST /api/auth/disconnect`
Revokes Gmail access and clears stored tokens.

---

## Emails

### `GET /api/emails`
Returns all inbox emails (excludes ARCHIVE and TRASH labels), AI-sorted.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `category` | string | Filter by category: `INBOX`, `SOCIAL`, `PROMOTIONS`, `TRANSACTIONS`, `FORUMS` |
| `q` | string | Full-text search across sender, subject, and snippet (case-insensitive ILIKE) |

**Response:**
```json
{
  "emails": [
    {
      "email": {
        "id": "uuid",
        "subject": "Your CV was downloaded",
        "from": "foundit - Monster",
        "fromEmail": "noreply@foundit.in",
        "snippet": "Get the app...",
        "body": "...",
        "date": "2026-03-13T00:00:00Z",
        "isRead": false,
        "labels": ["INBOX"],
        "category": "SOCIAL",
        "priorityScore": 100,
        "gmailId": "18e..."
      },
      "decision": {
        "id": "uuid",
        "emailId": "uuid",
        "category": "SOCIAL",
        "priorityScore": 100,
        "recommendedAction": "reply",
        "reason": "Recruiter activity on your profile...",
        "confidence": 0.92,
        "modelUsed": "local",
        "swarm": { ... }
      }
    }
  ],
  "summary": {
    "total": 499,
    "unreadCount": 73,
    "aiScoredCount": 481
  }
}
```

### `GET /api/emails/inbox-stats`
Returns aggregate stats for the SmartStatsBar.

**Response:**
```json
{
  "needActionCount": 25,
  "criticalCount": 21,
  "paymentsCount": 10,
  "unreadCount": 73,
  "aiScoredCount": 500
}
```

### `GET /api/emails/:id`
Returns a single email with its AI decision.

### `PATCH /api/emails/:id`
Updates email fields (read status, labels).

**Body:**
```json
{ "isRead": true }
```

### `GET /api/emails/sent`
Returns sent emails.

### `GET /api/emails/archive`
Returns archived emails.

### `GET /api/emails/trash`
Returns trashed emails.

---

## AI Decisions

### `POST /api/decisions/:emailId`
Triggers or re-triggers AI analysis for an email. Queues a classify + deepReason job.

**Response:**
```json
{
  "decision": {
    "category": "TRANSACTIONS",
    "priorityScore": 95,
    "recommendedAction": "track",
    "reason": "Bank transaction alert requiring attention",
    "confidence": 0.89,
    "modelUsed": "local",
    "swarm": {
      "agents": [
        { "agent": "Intent Agent", "finding": "Transaction notification", "confidence": 0.95 },
        { "agent": "Urgency Agent", "finding": "High urgency: declined transaction", "confidence": 0.90 }
      ],
      "finalCategory": "TRANSACTIONS",
      "finalPriorityScore": 95,
      "votedConfidence": 0.92,
      "agentTier": "full"
    }
  }
}
```

---

## Replies

### `POST /api/replies/:emailId`
Generates AI reply variants for an email.

**Body:**
```json
{
  "tone": "direct"
}
```

`tone` options: `direct` | `diplomatic` | `brief` | `detailed`

**Response:**
```json
{
  "reply": "Hi Nishant,\n\nThank you for reaching out...",
  "modelUsed": "cloud",
  "provider": "groq"
}
```

---

## Tasks

### `GET /api/tasks`
Returns all tasks, optionally filtered by status.

**Query params:** `status` = `pending` | `in_progress` | `done`

**Response:**
```json
{
  "tasks": [
    {
      "id": 1,
      "emailId": "uuid",
      "title": "Review declined transaction for Axis Bank",
      "type": "track",
      "priority": 95,
      "status": "pending",
      "createdAt": "2026-03-29T00:00:00Z"
    }
  ]
}
```

### `POST /api/tasks/generate`
Auto-generates tasks from emails with `priorityScore >= 50`. Returns count of tasks created.

**Response:**
```json
{ "created": 31 }
```

### `PATCH /api/tasks/:id`
Updates a task's status.

**Body:**
```json
{ "status": "done" }
```

---

## Cleanup

### `GET /api/cleanup/candidates`
Returns all cleanup candidates scored by the heuristic engine.

**Response:**
```json
{
  "candidates": [
    {
      "emailId": "uuid",
      "subject": "Your weekly newsletter",
      "from": "newsletter@example.com",
      "score": 87,
      "category": "newsletter",
      "reasons": ["Unsubscribe link present", "Promotional keywords", "PROMOTIONS label"],
      "unsubscribeLink": "https://example.com/unsubscribe?token=..."
    }
  ],
  "summary": {
    "total": 195,
    "byCategory": {
      "newsletter": 122,
      "promotion": 64,
      "irrelevant": 9,
      "spam": 0
    }
  }
}
```

### `POST /api/cleanup/execute`
Executes bulk actions on selected emails.

**Body:**
```json
{
  "emailIds": ["uuid1", "uuid2"],
  "action": "archive"
}
```

`action` options: `archive` | `spam` | `trash`

**Response:**
```json
{ "processed": 2, "action": "archive" }
```

### `POST /api/spam/feedback`
Records user feedback on spam classification for learning loop.

**Body:**
```json
{
  "emailId": "uuid",
  "wasCorrect": false
}
```

---

## Actions

### `POST /api/actions`
Records a user action on an email (open, reply, archive, trash, etc.).

**Body:**
```json
{
  "emailId": "uuid",
  "action": "archive",
  "metadata": {}
}
```

---

## Outcome Signals

### `POST /api/outcome-signals`
Records outcome feedback to improve AI prioritisation.

**Body:**
```json
{
  "emailId": "uuid",
  "signal": "important",
  "feedback": "This was actually urgent"
}
```

---

## Sync

### `POST /api/sync/trigger`
Manually triggers a Gmail sync for the authenticated user.

**Response:**
```json
{ "synced": 5, "newEmails": 3 }
```

---

## AI Status

### `GET /api/ai-status`
Returns the current state of the AI pipeline including GPU, Ollama, and active models.

**Response:**
```json
{
  "gpu": {
    "available": true,
    "name": "NVIDIA GeForce RTX 3080",
    "utilization": 34,
    "memoryFree": 7200,
    "memoryTotal": 10240
  },
  "llm": {
    "available": true,
    "models": ["llama3.1:8b", "mistral:7b"],
    "endpoint": "http://localhost:11434"
  },
  "cuda": {
    "available": true,
    "device": "NVIDIA GeForce RTX 3080",
    "numGpuLayers": 35,
    "gpuMemoryFraction": 0.90
  },
  "activeModel": "llama3.1:8b"
}
```

---

## Health & Metrics

### `GET /healthz`
Liveness + readiness check. Used by load balancers and Docker healthcheck.

**Response:**
```json
{
  "status": "ok",
  "checks": {
    "db": { "ok": true },
    "llm": { "ok": true },
    "gpu": { "ok": true, "reason": "gpu_detected:NVIDIA GeForce RTX 3080" },
    "queue": { "ok": true }
  }
}
```

`status` = `"ok"` | `"degraded"`

### `GET /api/metrics`
Detailed operational metrics for monitoring dashboards.

**Response:**
```json
{
  "queues": [
    {
      "queue": "local",
      "depth": 0,
      "active": 1,
      "max_depth": 200,
      "total_processed": 481,
      "dlq_depth": 0,
      "last_progress_ms": 1711718400000
    }
  ],
  "circuit_breakers": {
    "local:ollama": { "state": "closed", "errorRate": 0, "p95Ms": 1200 },
    "groq": { "state": "closed", "errorRate": 0.02, "p95Ms": 800 }
  },
  "providers": { ... },
  "cache": {
    "size": 481,
    "max_size": 1000,
    "hit_rate": 0.94,
    "hits": 320,
    "misses": 20
  },
  "fallback_rate": 0.08,
  "gpu": { ... },
  "llm": { ... }
}
```

---

## Settings

### `GET /api/settings`
Returns user settings.

### `PATCH /api/settings`
Updates user settings.

**Body:**
```json
{
  "syncInterval": 300,
  "defaultReplyTone": "direct",
  "notifications": true
}
```
