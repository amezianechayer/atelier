import { appendEvent } from '@atelier/core';
import { missions, ventures } from '@atelier/db';
import { and, eq, inArray } from 'drizzle-orm';
import { apiError, isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';

/** POST /missions/{id}/run (SPEC.md §9) : backlog -> queued + événement mission.run. */

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
    .set({ status: 'queued' })
    .where(and(eq(missions.id, id), inArray(missions.status, ['backlog', 'failed'])))
    .returning({ id: missions.id });
  if (!updated) {
    return apiError(
      409,
      'not_runnable',
      `Cette mission est « ${row.mission.status} », pas relançable.`,
      'Seules les missions backlog (ou failed) se lancent.',
    );
  }

  await appendEvent(db, row.mission.ventureId, 'mission_state', {
    missionId: id,
    status: 'queued',
  });

  try {
    await inngest.send({ name: 'mission.run', data: { missionId: id } });
  } catch {
    await db.update(missions).set({ status: 'backlog' }).where(eq(missions.id, id));
    return apiError(
      503,
      'worker_unavailable',
      'Le worker est injoignable : mission remise au backlog.',
      'Vérifie que le worker et le dev server Inngest tournent, puis relance.',
    );
  }
  return Response.json({ missionId: id, status: 'queued' }, { status: 202 });
}
