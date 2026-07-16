import { actions, ventures } from '@atelier/db';
import { and, desc, eq } from 'drizzle-orm';
import { isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** File d'approbation (SPEC.md §9) : aperçu EXACT — le payload est le contenu exécutable. */

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

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const where =
    status !== null
      ? and(eq(actions.ventureId, id), eq(actions.status, status as never))
      : eq(actions.ventureId, id);

  const rows = await db
    .select({
      id: actions.id,
      missionId: actions.missionId,
      class: actions.class,
      kind: actions.kind,
      payload: actions.payload,
      status: actions.status,
      requiresApproval: actions.requiresApproval,
      createdAt: actions.createdAt,
      decidedAt: actions.decidedAt,
      executedAt: actions.executedAt,
    })
    .from(actions)
    .where(where)
    .orderBy(desc(actions.createdAt))
    .limit(100);

  return Response.json({ actions: rows });
}
