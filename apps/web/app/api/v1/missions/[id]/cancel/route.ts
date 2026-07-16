import { appendEvent } from '@atelier/core';
import { missions, ventures } from '@atelier/db';
import { and, eq, inArray } from 'drizzle-orm';
import { apiError, isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';
import { logger } from '@/lib/logger';

/** POST /missions/{id}/cancel (SPEC.md §9) : annulation propre via cancelOn Inngest. */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const db = getDb();
  const [row] = await db
    .select({ mission: missions })
    .from(missions)
    .innerJoin(ventures, eq(ventures.id, missions.ventureId))
    .where(and(eq(missions.id, id), eq(ventures.userId, user.id)));
  if (!row) return notFound();

  const [updated] = await db
    .update(missions)
    .set({ status: 'cancelled', endedAt: new Date() })
    .where(
      and(
        eq(missions.id, id),
        inArray(missions.status, ['queued', 'running', 'awaiting_approval']),
      ),
    )
    .returning({ id: missions.id });
  if (!updated) {
    return apiError(409, 'not_cancellable', `Cette mission est « ${row.mission.status} ».`);
  }

  await appendEvent(db, row.mission.ventureId, 'mission_state', {
    missionId: id,
    status: 'cancelled',
  });
  try {
    await inngest.send({ name: 'mission.cancel', data: { missionId: id } });
  } catch (err) {
    logger.error({ err, missionId: id }, "échec d'émission de mission.cancel");
  }
  return Response.json({ missionId: id, status: 'cancelled' });
}
