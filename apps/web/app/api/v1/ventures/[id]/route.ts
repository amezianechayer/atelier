import { ventures } from '@atelier/db';
import { updateVentureInputSchema } from '@atelier/shared';
import { and, eq } from 'drizzle-orm';
import { isUuid, notFound, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const [venture] = await getDb()
    .select()
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, user.id)));
  return venture ? Response.json({ venture }) : notFound();
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { id } = await context.params;
  if (!isUuid(id)) return notFound();

  const input = await parseJsonBody(request, updateVentureInputSchema);
  if (input instanceof Response) return input;

  const [updated] = await getDb()
    .update(ventures)
    .set(input)
    .where(and(eq(ventures.id, id), eq(ventures.userId, user.id)))
    .returning();
  return updated ? Response.json({ venture: updated }) : notFound();
}
