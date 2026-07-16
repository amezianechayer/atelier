/**
 * Tests d'intégration sur un vrai Postgres 16 + pgvector (Testcontainers) :
 * migrations complètes et trigger append-only du ledger. (Le roundtrip du coffre
 * en base vit dans packages/core/src/trust.integration.test.ts.)
 */
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { ledgerEvents, users, ventures } from './schema';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

let container: StartedPostgreSqlContainer;
let db: Db;
let pool: { end(): Promise<void> };

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const created = createDb(container.getConnectionUri());
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('migrations sur base vierge', () => {
  it('crée les 21 tables attendues (18 du §6 + 3 Better Auth)', async () => {
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
    );
    expect(rows.rows[0]?.n).toBe(21);
  });

  it("l'extension vector et l'index HNSW sont en place", async () => {
    const ext = await db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
    expect(ext.rows).toHaveLength(1);
    const idx = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE indexname = 'idx_memory_chunks_embedding_hnsw'`,
    );
    expect(idx.rows).toHaveLength(1);
  });
});

describe('ledger append-only (trigger SQL)', () => {
  it('accepte INSERT mais rejette UPDATE et DELETE', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'ledger@test.local' })
      .returning({ id: users.id });
    if (!user) throw new Error('insert user');
    const [venture] = await db
      .insert(ventures)
      .values({ userId: user.id, name: 'v', pitch: 'p' })
      .returning({ id: ventures.id });
    if (!venture) throw new Error('insert venture');

    await db
      .insert(ledgerEvents)
      .values({ ventureId: venture.id, seq: 1, type: 'mission_state', payload: {} });

    // drizzle enveloppe l'erreur pg : le message du trigger est dans la chaîne des causes.
    const raisesAppendOnly = (e: unknown): boolean => {
      for (let err = e; err instanceof Error; err = err.cause) {
        if (err.message.includes('append-only')) return true;
      }
      return false;
    };
    await expect(
      db.update(ledgerEvents).set({ type: 'tampered' }).where(eq(ledgerEvents.seq, 1)),
    ).rejects.toSatisfy(raisesAppendOnly);
    await expect(db.delete(ledgerEvents).where(eq(ledgerEvents.seq, 1))).rejects.toSatisfy(
      raisesAppendOnly,
    );
  });
});
