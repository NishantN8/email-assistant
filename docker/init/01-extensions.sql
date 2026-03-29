-- ─────────────────────────────────────────────────────────────────
-- PostgreSQL initialization: enable extensions
-- Runs once on first container start
-- ─────────────────────────────────────────────────────────────────

-- pgvector: semantic search, email/sender embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: fast fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- uuid-ossp: UUID generation inside SQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
