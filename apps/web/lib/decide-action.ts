import { appendEvent } from '@atelier/core';
import { actions, ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import { apiError, isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';
import { logger } from '@/lib/logger';

/**
 * Décision humaine sur une action (SPEC.md §8.2/§9) : statut + ledger + événement
 * Inngest action.decided (réveille le waitForEvent 72 h de mission/run).
 */
export async function decideAction(
  request: Request,
  actionId: string,
  decision: 'approved' | 'rejected',
): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  if (!isUuid(actionId)) return notFound();

  const db = getDb();
  const [row] = await db
    .select({ action: actions })
    .from(actions)
    .innerJoin(ventures, eq(ventures.id, actions.ventureId))
    .where(and(eq(actions.id, actionId), eq(ventures.userId, user.id)));
  if (!row) return notFound();

  if (row.action.status !== 'pending') {
    return apiError(
      409,
      'already_decided',
      `Cette action est déjà « ${row.action.status} ».`,
      'Recharge la file d’approbation.',
    );
  }

  const [updated] = await db
    .update(actions)
    .set({ status: decision, decidedBy: user.id, decidedAt: new Date() })
    .where(and(eq(actions.id, actionId), eq(actions.status, 'pending')))
    .returning({ id: actions.id });
  if (!updated) {
    return apiError(409, 'already_decided', 'Cette action vient d’être décidée ailleurs.');
  }

  await appendEvent(db, row.action.ventureId, 'action_decided', {
    actionId,
    decision,
    decidedBy: user.id,
  });

  try {
    await inngest.send({
      name: 'action.decided',
      data: { actionId, ventureId: row.action.ventureId, decision },
    });
  } catch (err) {
    logger.error({ err, actionId }, "échec d'émission de action.decided");
    return apiError(
      503,
      'worker_unavailable',
      `Décision « ${decision} » enregistrée, mais le worker est injoignable pour l'exécuter.`,
      'Vérifie que le worker et le dev server Inngest tournent.',
    );
  }

  return Response.json({ actionId, decision });
}
