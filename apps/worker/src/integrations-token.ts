import { decryptSecret } from '@atelier/core';
import { integrations, secrets, ventures } from '@atelier/db';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { Runtime } from './runtime';

/**
 * Charge et déchiffre le token d'une intégration DE L'UTILISATEUR (SPEC.md §11).
 * Vit côté serveur (ActionExecutor) : jamais dans la sandbox ni les prompts d'agents.
 */
export async function loadIntegrationToken(
  rt: Runtime,
  ventureId: string,
  kind: 'github' | 'vercel',
): Promise<{ token: string; config: Record<string, unknown> }> {
  const { db, env } = rt;
  if (env.SECRETS_MASTER_KEY === '') {
    throw new Error('SECRETS_MASTER_KEY absente : le coffre est inutilisable côté worker.');
  }

  const [venture] = await db
    .select({ userId: ventures.userId })
    .from(ventures)
    .where(eq(ventures.id, ventureId));
  if (!venture) throw new Error(`venture ${ventureId} introuvable`);

  // Intégration de la venture, sinon globale (venture_id null), la plus récente.
  const [integration] = await db
    .select({ config: integrations.config, secretId: integrations.secretId })
    .from(integrations)
    .where(
      and(
        eq(integrations.userId, venture.userId),
        eq(integrations.kind, kind),
        or(eq(integrations.ventureId, ventureId), isNull(integrations.ventureId)),
      ),
    )
    .orderBy(desc(integrations.createdAt))
    .limit(1);
  if (!integration?.secretId) {
    throw new Error(
      `Aucune intégration « ${kind} » connectée : connecte-la dans Réglages avant de lancer le Builder.`,
    );
  }

  const [secret] = await db
    .select({ ciphertext: secrets.ciphertext, nonce: secrets.nonce })
    .from(secrets)
    .where(eq(secrets.id, integration.secretId));
  if (!secret) throw new Error(`secret ${integration.secretId} introuvable`);

  const token = decryptSecret(env.SECRETS_MASTER_KEY, {
    ciphertext: secret.ciphertext,
    nonce: secret.nonce,
  });
  return { token, config: integration.config as Record<string, unknown> };
}
