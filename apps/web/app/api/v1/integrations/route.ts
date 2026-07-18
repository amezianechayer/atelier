import { integrations } from '@atelier/db';
import { desc, eq } from 'drizzle-orm';
import { requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** Intégrations connectées de l'utilisateur — config uniquement, JAMAIS de secrets (SPEC.md §6). */
export async function GET(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const rows = await getDb()
    .select({
      id: integrations.id,
      kind: integrations.kind,
      config: integrations.config,
      status: integrations.status,
      createdAt: integrations.createdAt,
    })
    .from(integrations)
    .where(eq(integrations.userId, user.id))
    .orderBy(desc(integrations.createdAt));

  // Une seule entrée (la plus récente) par type — c'est celle que le worker utilise.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.kind)) latest.set(row.kind, row);
  }
  return Response.json({ integrations: [...latest.values()] });
}
