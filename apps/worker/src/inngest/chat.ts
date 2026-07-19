import { conversations, memoryDocs, messages, ventures } from '@atelier/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { chatReply } from '../agents/ceo';
import { createDeltaBuffer, publish } from '../notify';
import { getRuntime } from '../runtime';
import { sendTelegramText } from '../telegram';
import { inngest } from './client';

/**
 * Chat avec le CEO (SPEC.md §16 Phase 2) : apps/web insère le message utilisateur puis
 * émet chat.message ; le worker répond en streaming via NOTIFY -> SSE.
 */
export const chatMessage = inngest.createFunction(
  {
    id: 'chat-message',
    retries: 1,
    // Une réponse à la fois par venture : pas de réponses croisées.
    concurrency: { limit: 1, key: 'event.data.ventureId' },
    triggers: { event: 'chat.message' },
  },
  async ({ event, step }) => {
    const rt = getRuntime();
    const { db } = rt;
    const ventureId = event.data.ventureId as string;
    const conversationId = event.data.conversationId as string;

    await step.run('repondre', async () => {
      const [venture] = await db.select().from(ventures).where(eq(ventures.id, ventureId));
      if (!venture) throw new Error(`venture ${ventureId} introuvable`);
      const [conversation] = await db
        .select({
          id: conversations.id,
          channel: conversations.channel,
          externalChatId: conversations.externalChatId,
        })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.ventureId, ventureId)));
      if (!conversation) throw new Error(`conversation ${conversationId} introuvable`);

      // Mémoire : dernière version de chaque doc.
      const docs = await db
        .select({ slug: memoryDocs.slug, content: memoryDocs.content, version: memoryDocs.version })
        .from(memoryDocs)
        .where(eq(memoryDocs.ventureId, ventureId))
        .orderBy(desc(memoryDocs.version));
      const latestBySlug = new Map<string, string>();
      for (const d of docs) {
        if (!latestBySlug.has(d.slug)) latestBySlug.set(d.slug, d.content);
      }

      const history = await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.id))
        .then((rows) => rows.slice(-30));

      const router = rt.routerFor(ventureId);
      const buffer = createDeltaBuffer((text) =>
        publish(db, ventureId, { type: 'chat.delta', conversationId, text }),
      );
      const { text, costUsd } = await chatReply({
        ctx: { ventureId, ventureName: venture.name, pitch: venture.pitch, locale: 'fr' },
        router,
        memory: [...latestBySlug.entries()].map(([slug, content]) => ({ slug, content })),
        history,
        onDelta: (t) => buffer.push(t),
      });
      await buffer.end();

      await db.insert(messages).values({ conversationId, role: 'ceo', content: text });
      await publish(db, ventureId, { type: 'chat.done', conversationId, costUsd });

      // Conversation Telegram : la réponse part aussi sur le téléphone (Phase 6).
      if (conversation.channel === 'telegram' && conversation.externalChatId) {
        await sendTelegramText(conversation.externalChatId, text);
      }
    });

    return { conversationId, status: 'done' };
  },
);
