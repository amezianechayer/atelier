import { ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { isUuid, notFound, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Flux SSE de la venture (onboarding, chat, compteur de dépense) alimenté par
 * Postgres LISTEN/NOTIFY (SPEC.md §3). Un client pg dédié par connexion SSE.
 */

export const dynamic = 'force-dynamic';

const EVENTS_CHANNEL = 'atelier_events';
const HEARTBEAT_MS = 25_000;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { id } = await context.params;
  if (!isUuid(id)) return notFound();
  const [venture] = await getDb()
    .select({ id: ventures.id })
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, user.id)));
  if (!venture) return notFound();

  const client = new pg.Client({ connectionString: getEnv().DATABASE_URL });
  await client.connect();
  await client.query(`LISTEN ${EVENTS_CHANNEL}`);

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        client.end().catch(() => {});
        try {
          controller.close();
        } catch {
          // déjà fermé
        }
      };

      client.on('notification', (msg) => {
        if (closed || !msg.payload) return;
        try {
          const payload = JSON.parse(msg.payload) as { ventureId?: string };
          if (payload.ventureId !== id) return;
          controller.enqueue(encoder.encode(`data: ${msg.payload}\n\n`));
        } catch (err) {
          logger.warn({ err }, 'notification NOTIFY illisible');
        }
      });
      client.on('error', cleanup);

      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': ping\n\n'));
      }, HEARTBEAT_MS);

      request.signal.addEventListener('abort', cleanup);
      controller.enqueue(encoder.encode(': connecté\n\n'));
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      client.end().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
