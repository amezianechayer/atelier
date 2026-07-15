import { budgets, usageRecords, ventures } from '@atelier/db';
import { and, eq, sql } from 'drizzle-orm';
import { isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** Compteur de dépense — la jauge TOUJOURS visible (SPEC.md §10). */

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

  const [budget] = await db.select().from(budgets).where(eq(budgets.ventureId, id));
  const [spent] = await db
    .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
    .from(usageRecords)
    .where(eq(usageRecords.ventureId, id));

  return Response.json({
    totalUsd: Number(spent?.total ?? 0),
    monthlyLimitUsd: Number(budget?.monthlyLimitUsd ?? 0),
  });
}
