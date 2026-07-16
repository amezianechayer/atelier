import { missions, ventures } from '@atelier/db';
import { and, asc, eq } from 'drizzle-orm';
import { isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** Backlog de la venture (SPEC.md §9). */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const db = getDb();
  const [venture] = await db
    .select({ id: ventures.id })
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, user.id)));
  if (!venture) return notFound();

  const rows = await db
    .select({
      id: missions.id,
      agentRole: missions.agentRole,
      title: missions.title,
      instruction: missions.instruction,
      priority: missions.priority,
      status: missions.status,
      costActualUsd: missions.costActualUsd,
      resultSummary: missions.resultSummary,
    })
    .from(missions)
    .where(eq(missions.ventureId, id))
    .orderBy(asc(missions.priority), asc(missions.createdAt));

  return Response.json({ missions: rows });
}
