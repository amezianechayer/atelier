import { normalizeEmail, verifyUnsubscribeToken } from '@atelier/core';
import { outreachContacts, suppressionList } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';

/**
 * Page publique de désinscription (SPEC.md §8.4) — cliquée depuis un email, SANS session.
 * Le token HMAC prouve l'email ; l'ajout à la suppression list globale est idempotent et
 * qu'AUCUN chemin d'envoi ne peut contourner.
 */

export const dynamic = 'force-dynamic';

async function unsubscribe(token: string): Promise<{ ok: boolean; email?: string }> {
  const env = getEnv();
  if (env.SECRETS_MASTER_KEY === '') return { ok: false };
  const decoded = verifyUnsubscribeToken(env.SECRETS_MASTER_KEY, token);
  if (!decoded) return { ok: false };

  const email = normalizeEmail(decoded.email);
  const db = getDb();
  // Suppression list GLOBALE (jamais contournable), idempotente.
  await db
    .insert(suppressionList)
    .values({ email, reason: 'unsubscribe' })
    .onConflictDoNothing({ target: suppressionList.email });
  // Statut du contact de la venture concernée.
  await db
    .update(outreachContacts)
    .set({ status: 'unsubscribed' })
    .where(
      and(eq(outreachContacts.ventureId, decoded.ventureId), eq(outreachContacts.email, email)),
    );
  return { ok: true, email };
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await unsubscribe(token) : { ok: false };

  return (
    <main className="page page-narrow" style={{ paddingTop: '14vh', textAlign: 'center' }}>
      {result.ok ? (
        <>
          <p className="eyebrow" style={{ justifyContent: 'center' }}>
            Atelier
          </p>
          <h1>C'est fait.</h1>
          <p className="muted">
            {result.email} ne recevra plus d'emails de prospection. Désinscription enregistrée.
          </p>
        </>
      ) : (
        <>
          <h1>Lien invalide</h1>
          <p className="muted">
            Ce lien de désinscription est invalide ou expiré. Réponds simplement « STOP » à l'email
            et nous te retirerons.
          </p>
        </>
      )}
    </main>
  );
}
