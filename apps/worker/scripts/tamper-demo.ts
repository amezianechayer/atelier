/**
 * Démo d'acceptation Phase 3, scénario 3 : un attaquant avec accès SQL falsifie un
 * événement du ledger -> verifyChain le détecte au seq exact.
 * Lancer : pnpm --filter worker exec tsx scripts/tamper-demo.ts
 */
import { loadDotEnv, loadEnv } from '@atelier/config';
import { appendEvent, verifyChain } from '@atelier/core';
import { createDb, users, ventures } from '@atelier/db';
import { sql } from 'drizzle-orm';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

// Venture jetable, hors de tes vraies ventures.
const [user] = await db
  .insert(users)
  .values({ email: `tamper-demo-${Date.now()}@test.local` })
  .returning({ id: users.id });
if (!user) throw new Error('seed user');
const [venture] = await db
  .insert(ventures)
  .values({ userId: user.id, name: 'demo-tampering', pitch: 'venture jetable' })
  .returning({ id: ventures.id });
if (!venture) throw new Error('seed venture');
const ventureId = venture.id;

console.log('1. Trois événements ajoutés au ledger…');
await appendEvent(db, ventureId, 'mission_state', { missionId: 'm-1', status: 'running' });
await appendEvent(db, ventureId, 'usage', { costUsd: 0.02, model: 'claude-sonnet-5' });
await appendEvent(db, ventureId, 'mission_state', { missionId: 'm-1', status: 'done' });

console.log('2. verifyChain avant falsification :', await verifyChain(db, ventureId));

console.log('3. Falsification SQL du payload au seq 2 (trigger désactivé par l’attaquant)…');
await db.execute(sql`ALTER TABLE ledger_events DISABLE TRIGGER trg_ledger_events_append_only`);
await db.execute(
  sql`UPDATE ledger_events SET payload = '{"costUsd": 0.000001}'::jsonb
      WHERE venture_id = ${ventureId} AND seq = 2`,
);
await db.execute(sql`ALTER TABLE ledger_events ENABLE TRIGGER trg_ledger_events_append_only`);

const result = await verifyChain(db, ventureId);
console.log('4. verifyChain après falsification :', result);

if (!result.ok && result.brokenAtSeq === 2) {
  console.log('✓ Falsification détectée au seq exact (2) — acceptation Phase 3 scénario 3.');
} else {
  console.error('✗ ÉCHEC : la falsification n’a pas été détectée correctement.');
  process.exitCode = 1;
}
await pool.end();
