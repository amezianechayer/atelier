import { normalizeEmail } from '@atelier/core';
import { outreachContacts, suppressionList, ventures } from '@atelier/db';
import { importContactsInputSchema } from '@atelier/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { isUuid, notFound, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/** Contacts de prospection (SPEC.md §11) : import avec source obligatoire, jamais non sourcé. */

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
      email: outreachContacts.email,
      firstName: outreachContacts.firstName,
      company: outreachContacts.company,
      source: outreachContacts.source,
      status: outreachContacts.status,
    })
    .from(outreachContacts)
    .where(eq(outreachContacts.ventureId, id))
    .orderBy(desc(outreachContacts.contactedAt))
    .limit(500);
  return Response.json({ contacts: rows });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!(await ownedVenture(user.id, id))) return notFound();

  const input = await parseJsonBody(request, importContactsInputSchema);
  if (input instanceof Response) return input;

  const db = getDb();
  const emails = input.contacts.map((c) => normalizeEmail(c.email));
  // Les désinscrits globaux ne sont jamais réimportés comme contactables.
  const suppressed = new Set(
    (
      await db
        .select({ email: suppressionList.email })
        .from(suppressionList)
        .where(inArray(suppressionList.email, emails))
    ).map((s) => s.email),
  );

  let imported = 0;
  let skippedSuppressed = 0;
  for (const c of input.contacts) {
    const email = normalizeEmail(c.email);
    if (suppressed.has(email)) {
      skippedSuppressed++;
      continue;
    }
    await db
      .insert(outreachContacts)
      .values({
        ventureId: id,
        email,
        firstName: c.firstName ?? null,
        company: c.company ?? null,
        source: input.source, // provenance obligatoire (validée par le schéma)
        status: 'new',
      })
      .onConflictDoNothing({
        target: [outreachContacts.ventureId, outreachContacts.email],
      });
    imported++;
  }
  return Response.json({ imported, skippedSuppressed }, { status: 201 });
}
