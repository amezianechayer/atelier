import { conversations, messages, ventures } from '@atelier/db';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiError, isUuid, notFound, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';

/** Chat avec le CEO (SPEC.md §9) : web insère le message et émet chat.message. */

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'message vide').max(4000, '4000 caractères maximum'),
});

type RouteContext = { params: Promise<{ ventureId: string }> };

async function ownedVenture(userId: string, ventureId: string) {
  if (!isUuid(ventureId)) return undefined;
  const [venture] = await getDb()
    .select({ id: ventures.id })
    .from(ventures)
    .where(and(eq(ventures.id, ventureId), eq(ventures.userId, userId)));
  return venture;
}

async function webConversation(ventureId: string) {
  const db = getDb();
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.ventureId, ventureId), eq(conversations.channel, 'web')));
  if (existing) return existing.id;
  const [created] = await db
    .insert(conversations)
    .values({ ventureId, channel: 'web' })
    .returning({ id: conversations.id });
  if (!created) throw new Error('création de conversation échouée');
  return created.id;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { ventureId } = await context.params;
  if (!(await ownedVenture(user.id, ventureId))) return notFound();

  const conversationId = await webConversation(ventureId);
  const rows = await getDb()
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.id));
  return Response.json({ conversationId, messages: rows });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { ventureId } = await context.params;
  if (!(await ownedVenture(user.id, ventureId))) return notFound();

  const input = await parseJsonBody(request, sendMessageSchema);
  if (input instanceof Response) return input;

  const conversationId = await webConversation(ventureId);
  await getDb().insert(messages).values({ conversationId, role: 'user', content: input.content });

  try {
    await inngest.send({ name: 'chat.message', data: { ventureId, conversationId } });
  } catch {
    return apiError(
      503,
      'worker_unavailable',
      'Ton message est enregistré mais le CEO est injoignable.',
      'Vérifie que le worker et le dev server Inngest tournent, puis renvoie le message.',
    );
  }
  return Response.json({ conversationId }, { status: 202 });
}
