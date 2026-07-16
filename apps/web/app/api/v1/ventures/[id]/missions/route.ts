import { appendEvent } from '@atelier/core';
import { missions, ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiError, isUuid, notFound, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';

/** Création d'une mission (SPEC.md §9) : backlog, ou lancement immédiat via run:true. */

const createMissionSchema = z.object({
  agentRole: z.enum(['ceo', 'researcher', 'builder', 'marketer']),
  title: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(1).max(2000),
  priority: z.number().int().min(1).max(5).default(3),
  run: z.boolean().default(false),
});

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

  const input = await parseJsonBody(request, createMissionSchema);
  if (input instanceof Response) return input;

  const [mission] = await db
    .insert(missions)
    .values({
      ventureId: id,
      agentRole: input.agentRole,
      title: input.title,
      instruction: input.instruction,
      origin: 'user_chat',
      priority: input.priority,
      status: input.run ? 'queued' : 'backlog',
    })
    .returning({ id: missions.id, status: missions.status });
  if (!mission) throw new Error('création de mission échouée');

  if (input.run) {
    await appendEvent(db, id, 'mission_state', { missionId: mission.id, status: 'queued' });
    try {
      await inngest.send({ name: 'mission.run', data: { missionId: mission.id } });
    } catch {
      await db.update(missions).set({ status: 'backlog' }).where(eq(missions.id, mission.id));
      return apiError(
        503,
        'worker_unavailable',
        'Mission créée mais le worker est injoignable : elle reste au backlog.',
      );
    }
  }

  return Response.json({ mission }, { status: 201 });
}
