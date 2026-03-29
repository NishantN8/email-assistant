-- ─────────────────────────────────────────────────────────────────
-- Intelligence Engine Upgrade — new tables (additive migration)
-- These tables are also managed by Drizzle ORM schema + drizzle-kit push
-- This file is for local/Docker bootstrap environments only
-- IMPORTANT: Column names/types must match Drizzle schema definitions exactly
-- ─────────────────────────────────────────────────────────────────

-- Outcome Signals: tracks email reply outcomes for learning
CREATE TABLE IF NOT EXISTS outcome_signals (
  id                    TEXT PRIMARY KEY,
  email_id              TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  thread_id             TEXT,
  outcome_type          TEXT NOT NULL DEFAULT 'ignored',
  sentiment_score       DOUBLE PRECISION NOT NULL DEFAULT 0,
  response_time_minutes INTEGER,
  intent                TEXT NOT NULL DEFAULT '',
  strategy              TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcome_signals_email_id ON outcome_signals(email_id);
CREATE INDEX IF NOT EXISTS idx_outcome_signals_thread_id ON outcome_signals(thread_id);
CREATE INDEX IF NOT EXISTS idx_outcome_signals_outcome_type ON outcome_signals(outcome_type);

-- Strategy Patterns: maps intent+strategy combos to outcome success metrics
-- Column names match Drizzle schema (strategy_patterns.ts) exactly
CREATE TABLE IF NOT EXISTS strategy_patterns (
  id                       TEXT PRIMARY KEY,
  intent                   TEXT NOT NULL,
  strategy                 TEXT NOT NULL,
  success_rate             REAL NOT NULL DEFAULT 0,
  avg_response_time_minutes INTEGER,
  usage_count              INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intent, strategy)
);

CREATE INDEX IF NOT EXISTS idx_strategy_patterns_intent ON strategy_patterns(intent);

-- Tasks: structured action items derived from emails
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  email_id    TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL DEFAULT 'review',
  task_text   TEXT NOT NULL DEFAULT '',
  priority    INTEGER NOT NULL DEFAULT 50,
  status      TEXT NOT NULL DEFAULT 'needs_action',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_email_id ON tasks(email_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Model Profiles: GPU/VRAM-aware model metadata for smart routing
-- Column names match Drizzle schema (model_profiles.ts) exactly — no display_name, no last_used_at
CREATE TABLE IF NOT EXISTS model_profiles (
  id                TEXT PRIMARY KEY,
  model_id          TEXT NOT NULL UNIQUE,
  tier              TEXT NOT NULL DEFAULT 'cloud',
  strengths         JSONB NOT NULL DEFAULT '[]',
  weaknesses        JSONB NOT NULL DEFAULT '[]',
  best_use_cases    JSONB NOT NULL DEFAULT '[]',
  avg_latency_ms    INTEGER DEFAULT 0,
  quality_score     REAL DEFAULT 0.5,
  vram_required_mb  INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
