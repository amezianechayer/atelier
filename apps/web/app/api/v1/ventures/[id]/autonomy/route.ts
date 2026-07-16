import { autonomySettings, ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isUuid, notFound, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** Autonomie graduée par sous-classe (SPEC.md §2.5) : 0 approbation, 1 auto+undo, 2 auto plafonné. */

const putSchema = z.object({
  settings: z
    .array(
      z.object({
        actionKind: z.string().trim().min(1).max(50),
        level: z.number().int().min(0).max(2),
        cap: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(20),
});

type RouteContext = { params: Promise<{ id: string }> };

async function ownedVenture(userId: string, id: string) {
  if (!isUuid(id)) return undefined;
  const [venture] = await getDb()
    .select({ id: ventures.id })
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, userId)));
  return venture;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!(await ownedVenture(user.id, id))) return notFound();

  const rows = await getDb()
    .select({
      actionKind: autonomySettings.actionKind,
      level: autonomySettings.level,
      cap: autonomySettings.cap,
    })
    .from(autonomySettings)
    .where(eq(autonomySettings.ventureId, id));
  return Response.json({ settings: rows });
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!(await ownedVenture(user.id, id))) return notFound();

  const input = await parseJsonBody(request, putSchema);
  if (input instanceof Response) return input;

  const db = getDb();
  for (const setting of input.settings) {
    await db
      .insert(autonomySettings)
      .values({ ventureId: id, ...setting })
      .onConflictDoUpdate({
        target: [autonomySettings.ventureId, autonomySettings.actionKind],
        set: { level: setting.level, cap: setting.cap },
      });
  }
  return Response.json({ updated: input.settings.length });
}
