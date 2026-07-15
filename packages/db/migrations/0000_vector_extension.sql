-- Migration brute n°1 (SPEC.md §6) : extension pgvector, requise par
-- memory_chunks.embedding vector(1024) créé dans 0001_schema.
CREATE EXTENSION IF NOT EXISTS vector;
