import { conversations, messages, ventures } from '@atelier/db';
import { and, asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ChatLive } from './chat-live';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');
  const { id } = await params;

  const db = getDb();
  const [venture] = await db
    .select()
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, found.user.id)));
  if (!venture) notFound();

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.ventureId, id), eq(conversations.channel, 'web')));

  const history = conversation
    ? await db
        .select({ id: messages.id, role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.id))
    : [];

  return (
    <ChatLive
      ventureId={id}
      ventureName={venture.name}
      initialMessages={history.map((m) => ({ id: String(m.id), role: m.role, content: m.content }))}
    />
  );
}
