/**
 * Connecte les intégrations GitHub + Vercel d'un utilisateur (Phase 4, dev/démo) —
 * même chiffrement que le flux de connexion de l'app. Idempotent.
 * Lancer : GH_TOKEN=... VERCEL_TOKEN=... GH_REPO=owner/name VENTURE=<id> \
 *   pnpm --filter worker exec tsx scripts/seed-integrations.ts
 */
import { loadDotEnv, loadEnv } from '@atelier/config';
import { encryptSecret } from '@atelier/core';
import { createDb, integrations, secrets, ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';

loadDotEnv();
const env = loadEnv();
if (env.SECRETS_MASTER_KEY === '') throw new Error('SECRETS_MASTER_KEY requise');

const ghToken = process.env.GH_TOKEN ?? '';
const vercelToken = process.env.VERCEL_TOKEN ?? '';
const repo = process.env.GH_REPO ?? '';
const ventureId = process.env.VENTURE ?? '';
if (!ghToken || !vercelToken || !repo || !ventureId) {
  throw new Error('GH_TOKEN, VERCEL_TOKEN, GH_REPO, VENTURE requis');
}

const { db, pool } = createDb(env.DATABASE_URL);
const [venture] = await db
  .select({ userId: ventures.userId })
  .from(ventures)
  .where(eq(ventures.id, ventureId));
if (!venture) throw new Error(`venture ${ventureId} introuvable`);
const userId = venture.userId;

async function connect(kind: 'github' | 'vercel', token: string, config: Record<string, unknown>) {
  // Remplace toute intégration existante de ce type (idempotent).
  await db
    .delete(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, kind)));
  const sealed = encryptSecret(env.SECRETS_MASTER_KEY, token);
  const [secret] = await db
    .insert(secrets)
    .values({ userId, ciphertext: sealed.ciphertext, nonce: sealed.nonce })
    .returning({ id: secrets.id });
  if (!secret) throw new Error('insertion secret échouée');
  await db.insert(integrations).values({ userId, ventureId, kind, config, secretId: secret.id });
  console.log(`✓ ${kind} connectée`);
}

await connect('github', ghToken, { repo });
await connect('vercel', vercelToken, {});
console.log(`Intégrations prêtes pour la venture ${ventureId}.`);
await pool.end();
