/**
 * TDD strict (SPEC.md §15.4) — tests écrits AVANT l'implémentation de budget.ts et
 * ledger.ts, sur un vrai Postgres (Testcontainers).
 *
 * Tests de propriété exigés : TOUTE mutation d'un ledgerEvent casse verifyChain au bon
 * seq (le trigger append-only est désactivé pour simuler un attaquant ayant accès SQL).
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { budgets, createDb, type Db, nightCycles, secrets, users, ventures } from '@atelier/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordUsage } from './budget';
import { appendEvent, exportChain, genesisHash, verifyChain } from './ledger';
import { decryptSecret, encryptSecret } from './vault';

const MIGRATIONS = fileURLToPath(new URL('../../db/migrations', import.meta.url));

let container: StartedPostgreSqlContainer;
let db: Db;
let pool: { end(): Promise<void> };
let userId: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  const created = createDb(container.getConnectionUri());
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: MIGRATIONS });
  const [user] = await db
    .insert(users)
    .values({ email: 'trust@test.local' })
    .returning({ id: users.id });
  if (!user) throw new Error('seed user');
  userId = user.id;
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

async function makeVenture(opts: { monthlyLimitUsd?: string; hard?: boolean } = {}) {
  const [venture] = await db
    .insert(ventures)
    .values({ userId, name: 'v', pitch: 'p' })
    .returning({ id: ventures.id });
  if (!venture) throw new Error('seed venture');
  if (opts.monthlyLimitUsd !== undefined) {
    await db.insert(budgets).values({
      ventureId: venture.id,
      monthlyLimitUsd: opts.monthlyLimitUsd,
      nightLimitUsd: '1.00',
      hard: opts.hard ?? true,
    });
  }
  return venture.id;
}

/** Simule un attaquant avec accès SQL : trigger append-only désactivé le temps d'une mutation. */
async function tamper(mutationSql: ReturnType<typeof sql>) {
  await db.execute(sql`ALTER TABLE ledger_events DISABLE TRIGGER trg_ledger_events_append_only`);
  try {
    await db.execute(mutationSql);
  } finally {
    await db.execute(sql`ALTER TABLE ledger_events ENABLE TRIGGER trg_ledger_events_append_only`);
  }
}

describe('ledger — appendEvent / verifyChain (SPEC.md §7)', () => {
  it('chaîne propre : seq croissants, premier prevHash = SHA256(ventureId), verify ok', async () => {
    const ventureId = await makeVenture();
    const first = await appendEvent(db, ventureId, 'mission_state', { status: 'queued' });
    const second = await appendEvent(db, ventureId, 'action_created', { kind: 'publish_post' });
    const third = await appendEvent(db, ventureId, 'action_decided', { decision: 'approved' });

    expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
    expect(first.hash).toHaveLength(32);

    const rows = await db.execute(
      sql`SELECT prev_hash FROM ledger_events WHERE venture_id = ${ventureId} AND seq = 1`,
    );
    expect(Buffer.from(rows.rows[0]?.prev_hash as Buffer).equals(genesisHash(ventureId))).toBe(
      true,
    );

    await expect(verifyChain(db, ventureId)).resolves.toEqual({ ok: true });
  });

  it('les chaînes de deux ventures sont indépendantes', async () => {
    const a = await makeVenture();
    const b = await makeVenture();
    await appendEvent(db, a, 'message', { n: 1 });
    await appendEvent(db, b, 'message', { n: 1 });
    await appendEvent(db, a, 'message', { n: 2 });
    await expect(verifyChain(db, a)).resolves.toEqual({ ok: true });
    await expect(verifyChain(db, b)).resolves.toEqual({ ok: true });
  });

  it('le payload est canonicalisé : ordre des clés indifférent à la vérification', async () => {
    const ventureId = await makeVenture();
    await appendEvent(db, ventureId, 'usage', { b: 2, a: 1, nested: { z: true, a: [1, 2] } });
    await expect(verifyChain(db, ventureId)).resolves.toEqual({ ok: true });
  });

  describe('propriété : toute mutation casse verifyChain au bon seq', () => {
    // Chaque cas : [champ muté, seq visé, mutation SQL]
    const CASES: Array<[string, number]> = [
      ['payload', 1],
      ['payload', 2],
      ['payload', 3],
      ['type', 2],
      ['ts', 2],
      ['hash', 2],
      ['prev_hash', 3],
    ];

    it.each(CASES)('mutation de %s au seq %i -> brokenAtSeq exact', async (field, seq) => {
      const ventureId = await makeVenture();
      await appendEvent(db, ventureId, 'mission_state', { step: 1 });
      await appendEvent(db, ventureId, 'mission_state', { step: 2 });
      await appendEvent(db, ventureId, 'mission_state', { step: 3 });

      const mutations: Record<string, ReturnType<typeof sql>> = {
        payload: sql`UPDATE ledger_events SET payload = '{"falsifie": true}'::jsonb WHERE venture_id = ${ventureId} AND seq = ${seq}`,
        type: sql`UPDATE ledger_events SET type = 'usage' WHERE venture_id = ${ventureId} AND seq = ${seq}`,
        ts: sql`UPDATE ledger_events SET ts = ts + interval '1 second' WHERE venture_id = ${ventureId} AND seq = ${seq}`,
        hash: sql`UPDATE ledger_events SET hash = ${randomBytes(32)} WHERE venture_id = ${ventureId} AND seq = ${seq}`,
        prev_hash: sql`UPDATE ledger_events SET prev_hash = ${randomBytes(32)} WHERE venture_id = ${ventureId} AND seq = ${seq}`,
      };
      const mutation = mutations[field];
      if (!mutation) throw new Error(`cas inconnu ${field}`);
      await tamper(mutation);

      await expect(verifyChain(db, ventureId)).resolves.toEqual({ ok: false, brokenAtSeq: seq });
    });

    it('suppression d’un event (trou de seq) -> détectée', async () => {
      const ventureId = await makeVenture();
      await appendEvent(db, ventureId, 'message', { n: 1 });
      await appendEvent(db, ventureId, 'message', { n: 2 });
      await appendEvent(db, ventureId, 'message', { n: 3 });
      await tamper(sql`DELETE FROM ledger_events WHERE venture_id = ${ventureId} AND seq = 2`);
      const res = await verifyChain(db, ventureId);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.brokenAtSeq).toBe(2);
    });
  });

  it('exportChain produit du JSONL complet et lisible', async () => {
    const ventureId = await makeVenture();
    await appendEvent(db, ventureId, 'mission_state', { status: 'running' });
    await appendEvent(db, ventureId, 'usage', { costUsd: 0.01 });

    const stream = await exportChain(db, ventureId);
    const text = await new Response(stream).text();
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(first.seq).toBe(1);
    expect(first.type).toBe('mission_state');
    expect(String(first.hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(first.prevHash)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('budget — recordUsage avec coupure nette (SPEC.md §7)', () => {
  const usage = (ventureId: string, costUsd: number) => ({
    ventureId,
    model: 'claude-sonnet-5',
    inputTokens: 100,
    outputTokens: 50,
    costUsd,
  });

  it('décompte le mois courant et signale hardExceeded au dépassement', async () => {
    const ventureId = await makeVenture({ monthlyLimitUsd: '2.00' });

    const first = await recordUsage(db, usage(ventureId, 0.5));
    expect(first.remainingMonthUsd).toBeCloseTo(1.5, 6);
    expect(first.hardExceeded).toBe(false);
    expect(first.remainingNightUsd).toBeNull();

    const second = await recordUsage(db, usage(ventureId, 1.6));
    expect(second.remainingMonthUsd).toBeCloseTo(-0.1, 6);
    expect(second.hardExceeded).toBe(true);
  });

  it('budget hard=false : jamais de coupure', async () => {
    const ventureId = await makeVenture({ monthlyLimitUsd: '0.10', hard: false });
    const res = await recordUsage(db, usage(ventureId, 5));
    expect(res.remainingMonthUsd).toBeLessThan(0);
    expect(res.hardExceeded).toBe(false);
  });

  it('sans ligne budget : fail-closed (hardExceeded immédiat)', async () => {
    const ventureId = await makeVenture(); // pas de budget
    const res = await recordUsage(db, usage(ventureId, 0.01));
    expect(res.hardExceeded).toBe(true);
  });

  it("l'usage des autres ventures ne compte pas", async () => {
    const a = await makeVenture({ monthlyLimitUsd: '2.00' });
    const b = await makeVenture({ monthlyLimitUsd: '2.00' });
    await recordUsage(db, usage(b, 1.9));
    const res = await recordUsage(db, usage(a, 0.1));
    expect(res.remainingMonthUsd).toBeCloseTo(1.9, 6);
    expect(res.hardExceeded).toBe(false);
  });

  it("l'usage du mois précédent ne compte pas", async () => {
    const ventureId = await makeVenture({ monthlyLimitUsd: '1.00' });
    await db.execute(
      sql`INSERT INTO usage_records (venture_id, model, input_tokens, output_tokens, cost_usd, recorded_at)
          VALUES (${ventureId}, 'claude-sonnet-5', 10, 10, 5.0, now() - interval '40 days')`,
    );
    const res = await recordUsage(db, usage(ventureId, 0.2));
    expect(res.remainingMonthUsd).toBeCloseTo(0.8, 6);
    expect(res.hardExceeded).toBe(false);
  });

  it('cycle de nuit ouvert : remainingNightUsd calculé et coupure au plafond nuit', async () => {
    const ventureId = await makeVenture({ monthlyLimitUsd: '100.00' });
    await db.insert(nightCycles).values({ ventureId, budgetUsd: '1.00' });

    const first = await recordUsage(db, usage(ventureId, 0.4));
    expect(first.remainingNightUsd).toBeCloseTo(0.6, 6);
    expect(first.hardExceeded).toBe(false);

    const second = await recordUsage(db, usage(ventureId, 0.7));
    expect(second.remainingNightUsd).toBeCloseTo(-0.1, 6);
    // Plafond nuit dépassé => coupure, même si le mois est loin d'être épuisé.
    expect(second.hardExceeded).toBe(true);
  });
});

describe('coffre secrets en base (déplacé de packages/db)', () => {
  it('chiffre, stocke, relit et déchiffre un token', async () => {
    const masterKey = randomBytes(32).toString('base64');
    const token = 'ghp_token_de_test_0123456789abcdef';

    const sealed = encryptSecret(masterKey, token);
    const [stored] = await db
      .insert(secrets)
      .values({ userId, ciphertext: sealed.ciphertext, nonce: sealed.nonce })
      .returning({ id: secrets.id });
    if (!stored) throw new Error('insert secret');

    const [row] = await db.select().from(secrets).where(eq(secrets.id, stored.id));
    if (!row) throw new Error('lecture secret');
    expect(decryptSecret(masterKey, { ciphertext: row.ciphertext, nonce: row.nonce })).toBe(token);
    expect(row.ciphertext.includes(Buffer.from(token))).toBe(false);
  });
});
