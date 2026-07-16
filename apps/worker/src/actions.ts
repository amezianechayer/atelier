import { createHash } from 'node:crypto';
import type { ActionClass } from '@atelier/core';
import { appendEvent, type Counters, canonicalJson, classify } from '@atelier/core';
import { actions, autonomySettings, usageRecords } from '@atelier/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { publish } from './notify';
import type { Runtime } from './runtime';

/**
 * Proposition d'action par un agent (SPEC.md §7) : classification EN CODE,
 * insertion idempotente, journal au ledger, notification temps réel.
 * Une action de classe C naît pending — JAMAIS exécutée ici.
 */

/** Compteurs du jour, calculés côté code (jamais fournis par le modèle). */
export async function todayCounters(rt: Runtime, ventureId: string): Promise<Counters> {
  const [usd] = await rt.db
    .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
    .from(usageRecords)
    .where(
      and(eq(usageRecords.ventureId, ventureId), gte(usageRecords.recordedAt, sql`current_date`)),
    );
  // emailsToday : compté depuis les envois réels à partir de la Phase 5 (outreach).
  return { emailsToday: 0, usdToday: Number(usd?.total ?? 0) };
}

export async function proposeAction(
  rt: Runtime,
  input: { ventureId: string; missionId: string; kind: string; payload: unknown },
): Promise<{ actionId: string; class: ActionClass; requiresApproval: boolean }> {
  const { db } = rt;
  const autonomy = await db
    .select({
      actionKind: autonomySettings.actionKind,
      level: autonomySettings.level,
      cap: autonomySettings.cap,
    })
    .from(autonomySettings)
    .where(eq(autonomySettings.ventureId, input.ventureId));

  const decision = classify({
    ventureId: input.ventureId,
    kind: input.kind,
    payload: input.payload,
    autonomy: autonomy.map((a) => ({ ...a, cap: a.cap as Record<string, unknown> })),
    todayCounters: await todayCounters(rt, input.ventureId),
  });

  const idempotencyKey = `${input.missionId}:${input.kind}:${createHash('sha256')
    .update(canonicalJson(input.payload))
    .digest('hex')
    .slice(0, 16)}`;

  const [created] = await db
    .insert(actions)
    .values({
      missionId: input.missionId,
      ventureId: input.ventureId,
      class: decision.class,
      kind: input.kind,
      payload: input.payload as Record<string, unknown>,
      status: 'pending',
      requiresApproval: decision.requiresApproval,
      idempotencyKey,
      undoDeadline: decision.undoWindowMs ? new Date(Date.now() + decision.undoWindowMs) : null,
    })
    .onConflictDoNothing({ target: actions.idempotencyKey })
    .returning({ id: actions.id });

  if (!created) {
    // Déjà proposée (retry d'étape Inngest) : renvoyer l'existante, sans doublon.
    const [existing] = await db
      .select({ id: actions.id })
      .from(actions)
      .where(eq(actions.idempotencyKey, idempotencyKey));
    if (!existing) throw new Error('action idempotente introuvable');
    return {
      actionId: existing.id,
      class: decision.class,
      requiresApproval: decision.requiresApproval,
    };
  }

  await appendEvent(db, input.ventureId, 'action_created', {
    actionId: created.id,
    missionId: input.missionId,
    kind: input.kind,
    class: decision.class,
    requiresApproval: decision.requiresApproval,
    reason: decision.reason,
  });
  await publish(db, input.ventureId, {
    type: 'action.created',
    actionId: created.id,
    kind: input.kind,
    class: decision.class,
    requiresApproval: decision.requiresApproval,
    reason: decision.reason,
  });

  return {
    actionId: created.id,
    class: decision.class,
    requiresApproval: decision.requiresApproval,
  };
}
