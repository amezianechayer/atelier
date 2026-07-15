-- Migration brute n°2 (SPEC.md §6).

-- (a) Rappel sémantique : index HNSW cosinus sur les embeddings.
CREATE INDEX IF NOT EXISTS "idx_memory_chunks_embedding_hnsw"
  ON "memory_chunks"
  USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

-- (b) Ledger append-only strict : UPDATE et DELETE interdits au niveau SQL.
-- Correction = événement correctif, jamais de modification (SPEC.md §15.8).
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_events est append-only : % interdit (correction = événement correctif)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_ledger_events_append_only
  BEFORE UPDATE OR DELETE ON "ledger_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
