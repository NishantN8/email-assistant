-- ─────────────────────────────────────────────────────────────────
-- Vector embeddings tables (pgvector)
-- Created after drizzle migrations run
-- ─────────────────────────────────────────────────────────────────

-- Email embeddings for semantic search and clustering
CREATE TABLE IF NOT EXISTS email_embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id      UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  embedding     vector(1536),            -- text-embedding-3-small dimensions
  model         TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_embeddings_email_id
  ON email_embeddings(email_id);

-- IVFFlat index for fast ANN (approximate nearest neighbor) search
-- Requires at least 100 rows before it becomes effective
CREATE INDEX IF NOT EXISTS idx_email_embeddings_vector
  ON email_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Sender embeddings — capture per-sender communication style
CREATE TABLE IF NOT EXISTS sender_embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_email    TEXT NOT NULL UNIQUE,
  embedding     vector(1536),
  model         TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sender_embeddings_vector
  ON sender_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
