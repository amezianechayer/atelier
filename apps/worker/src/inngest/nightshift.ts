import { appendEvent, planNightCycle } from '@atelier/core';
import { actions, budgets, missions, nightCycles, usageRecords, ventures } from '@atelier/db';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { publish } from '../notify';
import { getRuntime } from '../runtime';
import { sendNightBrief } from '../telegram';
import { inngest } from './client';

/**
 * nightshift (SPEC.md §8.3) : cron toutes les 15 min -> ventures dont l'heure
 * locale correspond -> un cycle par venture et par nuit. La sélection des
 * missions est du CODE (planNightCycle, TDD core) ; le plafond nuit est appliqué
 * par recordUsage à CHAQUE appel modèle (cycle ouvert => remainingNightUsd).
 */

/** Heure locale (0-23) d'une venture, calculée depuis sa timezone IANA. */
export function localHour(timezone: string, at: Date = new Date()): number {
  try {
    const text = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(at);
    return Number(text) % 24;
  } catch {
    return -1; // timezone invalide : jamais éligible (fail-closed)
  }
}

const ONE_NIGHT_MS = 20 * 60 * 60 * 1000; // « une seule fois par nuit »

export const nightshiftTick = inngest.createFunction(
  { id: 'nightshift-tick', retries: 0, triggers: { cron: 'TZ=UTC */15 * * * *' } },
  async ({ step }) => {
    const { db } = getRuntime();

    const eligible = await step.run('selectionner-ventures', async () => {
      const candidates = await db
        .select({
          id: ventures.id,
          timezone: ventures.timezone,
          hour: ventures.nightShiftHourLocal,
        })
        .from(ventures)
        .where(and(eq(ventures.nightShiftEnabled, true), eq(ventures.status, 'active')));

      const now = new Date();
      const matching = candidates.filter((v) => localHour(v.timezone, now) === v.hour);
      if (matching.length === 0) return [];

      // Écarte les ventures avec un cycle ouvert ou déjà servi cette nuit.
      const recent = await db
        .select({ ventureId: nightCycles.ventureId })
        .from(nightCycles)
        .where(
          and(
            inArray(
              nightCycles.ventureId,
              matching.map((v) => v.id),
            ),
            sql`(${nightCycles.endedAt} is null or ${nightCycles.startedAt} > ${new Date(Date.now() - ONE_NIGHT_MS)})`,
          ),
        );
      const busy = new Set(recent.map((r) => r.ventureId));
      return matching.filter((v) => !busy.has(v.id)).map((v) => v.id);
    });

    if (eligible.length > 0) {
      await step.sendEvent(
        'demarrer-cycles',
        eligible.map((ventureId) => ({ name: 'nightshift.venture', data: { ventureId } })),
      );
    }
    return { ventures: eligible };
  },
);

export const nightshiftCycle = inngest.createFunction(
  {
    id: 'nightshift-cycle',
    retries: 0,
    concurrency: { limit: 1, key: 'event.data.ventureId' },
    triggers: { event: 'nightshift.venture' },
  },
  async ({ event, step }) => {
    const rt = getRuntime();
    const { db } = rt;
    const ventureId = event.data.ventureId as string;

    // 1. Ouvrir le cycle : plan EN CODE sous min(plafond nuit, budget mois restant).
    const opened = await step.run('ouvrir-cycle', async () => {
      const [open] = await db
        .select({ id: nightCycles.id })
        .from(nightCycles)
        .where(and(eq(nightCycles.ventureId, ventureId), isNull(nightCycles.endedAt)));
      if (open) return null; // idempotence : un seul cycle ouvert

      const [budget] = await db.select().from(budgets).where(eq(budgets.ventureId, ventureId));
      if (!budget) return null; // fail-closed : pas de plafond, pas de nuit

      const [month] = await db
        .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.ventureId, ventureId),
            gte(usageRecords.recordedAt, sql`date_trunc('month', now())`),
          ),
        );
      const remainingMonthUsd = Number(budget.monthlyLimitUsd) - Number(month?.total ?? 0);

      const backlog = await db
        .select({
          id: missions.id,
          priority: missions.priority,
          costEstimateUsd: missions.costEstimateUsd,
        })
        .from(missions)
        .where(and(eq(missions.ventureId, ventureId), eq(missions.status, 'backlog')));

      const plan = planNightCycle({
        candidates: backlog,
        nightLimitUsd: Number(budget.nightLimitUsd),
        remainingMonthUsd,
      });

      if (plan.budgetUsd <= 0 || plan.selected.length === 0) {
        await appendEvent(db, ventureId, 'night_cycle', {
          phase: 'skipped',
          reason: plan.budgetUsd <= 0 ? 'budget épuisé' : 'backlog vide sous le plafond',
        });
        return null;
      }

      const [cycle] = await db
        .insert(nightCycles)
        .values({ ventureId, budgetUsd: plan.budgetUsd.toFixed(2) })
        .returning({ id: nightCycles.id, startedAt: nightCycles.startedAt });
      if (!cycle) return null;

      await db
        .update(missions)
        .set({ nightCycleId: cycle.id })
        .where(inArray(missions.id, plan.selected));
      await appendEvent(db, ventureId, 'night_cycle', {
        phase: 'start',
        cycleId: cycle.id,
        budgetUsd: plan.budgetUsd,
        missionIds: plan.selected,
      });
      await publish(db, ventureId, {
        type: 'night.cycle',
        phase: 'start',
        budgetUsd: plan.budgetUsd,
        missions: plan.selected.length,
      });
      return {
        cycleId: cycle.id,
        startedAt: cycle.startedAt,
        budgetUsd: plan.budgetUsd,
        selected: plan.selected,
      };
    });
    if (!opened) return { ventureId, status: 'skipped' };

    // 2. Missions séquentielles — arrêt NET si le budget nuit est consommé.
    let stoppedEarly = false;
    let missionsRun = 0;
    for (const [i, missionId] of opened.selected.entries()) {
      const remaining = await step.run(`budget-restant-${i}`, async () => {
        const [night] = await db
          .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
          .from(usageRecords)
          .where(
            and(
              eq(usageRecords.ventureId, ventureId),
              gte(usageRecords.recordedAt, new Date(opened.startedAt)),
            ),
          );
        return opened.budgetUsd - Number(night?.total ?? 0);
      });
      if (remaining <= 0) {
        stoppedEarly = true;
        break;
      }

      await step.sendEvent(`lancer-mission-${i}`, {
        name: 'mission.run',
        data: { missionId },
      });
      await step.waitForEvent(`attendre-mission-${i}`, {
        event: 'mission.settled',
        timeout: '30m',
        if: `async.data.missionId == "${missionId}"`,
      });
      missionsRun += 1;
    }

    // 3. Brief du matin — construit EN CODE (fait / en attente / dépensé X sur Y / appris).
    const brief = await step.run('generer-brief', async () => {
      const ranMissions = await db
        .select({
          id: missions.id,
          title: missions.title,
          status: missions.status,
          resultSummary: missions.resultSummary,
          costActualUsd: missions.costActualUsd,
        })
        .from(missions)
        .where(eq(missions.nightCycleId, opened.cycleId));
      const pendingActions = await db
        .select({ id: actions.id, kind: actions.kind, class: actions.class })
        .from(actions)
        .where(
          and(
            eq(actions.ventureId, ventureId),
            eq(actions.status, 'pending'),
            eq(actions.requiresApproval, true),
            inArray(
              actions.missionId,
              ranMissions.map((m) => m.id),
            ),
          ),
        );
      const [night] = await db
        .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.ventureId, ventureId),
            gte(usageRecords.recordedAt, new Date(opened.startedAt)),
          ),
        );
      const spentUsd = Number(night?.total ?? 0);

      const [venture] = await db
        .select({
          name: ventures.name,
          userId: ventures.userId,
          briefChannel: ventures.briefChannel,
        })
        .from(ventures)
        .where(eq(ventures.id, ventureId));

      const done = ranMissions.filter((m) => m.status === 'done');
      const waiting = ranMissions.filter((m) => m.status === 'awaiting_approval');
      const other = ranMissions.filter(
        (m) => m.status !== 'done' && m.status !== 'awaiting_approval',
      );
      const learned = ranMissions
        .map((m) => m.resultSummary)
        .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        .map((s) => (s.length > 220 ? `${s.slice(0, 220)}…` : s));

      const lines: string[] = [
        `☀️ Brief du matin — ${venture?.name ?? 'ta venture'}`,
        '',
        `✅ Fait cette nuit (${done.length})`,
        ...done.map((m) => `  • ${m.title} (${Number(m.costActualUsd).toFixed(2)} $)`),
        ...(done.length === 0 ? ['  • rien de terminé cette nuit'] : []),
        '',
        `🛡️ En attente de ton accord (${pendingActions.length})`,
        ...waiting.map((m) => `  • ${m.title}`),
        ...(pendingActions.length === 0 ? ['  • rien à approuver'] : []),
        '',
        `💸 Dépensé : ${spentUsd.toFixed(2)} $ sur ${opened.budgetUsd.toFixed(2)} $ (plafond nuit)${stoppedEarly ? ' — arrêt anticipé, plafond atteint' : ''}`,
      ];
      if (other.length > 0) {
        lines.push(
          '',
          `⚠️ À revoir (${other.length})`,
          ...other.map((m) => `  • ${m.title} : ${m.status}`),
        );
      }
      if (learned.length > 0) {
        lines.push('', '🧠 Appris', ...learned.slice(0, 3).map((s) => `  • ${s}`));
      }

      const briefMd = lines.join('\n');
      await db
        .update(nightCycles)
        .set({
          endedAt: new Date(),
          spentUsd: spentUsd.toFixed(4),
          missionsRun,
          briefMd,
        })
        .where(eq(nightCycles.id, opened.cycleId));
      await appendEvent(db, ventureId, 'night_cycle', {
        phase: 'end',
        cycleId: opened.cycleId,
        spentUsd,
        budgetUsd: opened.budgetUsd,
        missionsRun,
        stoppedEarly,
        pendingActions: pendingActions.length,
      });
      return {
        briefMd,
        spentUsd,
        userId: venture?.userId ?? null,
        ventureName: venture?.name ?? '',
        briefChannel: venture?.briefChannel ?? 'web',
        pendingActions,
      };
    });

    // 4. Envoi du brief sur le canal configuré (Telegram avec boutons inline, sinon web).
    await step.run('envoyer-brief', async () => {
      let sentVia = 'web';
      if (brief.briefChannel === 'telegram' && brief.userId) {
        const sent = await sendNightBrief(rt, {
          userId: brief.userId,
          briefText: brief.briefMd,
          pendingActions: brief.pendingActions,
        });
        if (sent) sentVia = 'telegram';
      }
      await db
        .update(nightCycles)
        .set({ briefSentAt: new Date() })
        .where(eq(nightCycles.id, opened.cycleId));
      await publish(db, ventureId, {
        type: 'night.brief',
        cycleId: opened.cycleId,
        via: sentVia,
        spentUsd: brief.spentUsd,
        budgetUsd: opened.budgetUsd,
      });
      return sentVia;
    });

    return { ventureId, cycleId: opened.cycleId, missionsRun, status: 'done' };
  },
);
