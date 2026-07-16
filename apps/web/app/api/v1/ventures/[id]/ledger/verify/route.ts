import { verifyChain } from '@atelier/core';
import { ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import { isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** Vérification utilisateur de l'intégrité du journal (SPEC.md §11). */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
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

  return Response.json(await verifyChain(db, id));
}
