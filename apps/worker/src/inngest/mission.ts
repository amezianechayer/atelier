import { appendEvent } from '@atelier/core';
import { actions, missions, usageRecords, ventures } from '@atelier/db';
import { and, eq, sql } from 'drizzle-orm';
import { proposeAction } from '../actions';
import { runLandingBuilder } from '../agents/builder';
import { executeMissionAgent } from '../agents/mission-agent';
import { findExecutor } from '../executors';
import { createDeltaBuffer, publish } from '../notify';
import { BudgetExceededError, getRuntime } from '../runtime';
import { buildToolbox } from '../toolbox';
import { inngest } from './client';

/** Nom de projet Vercel stable par venture (préversion et prod pointent le même projet). */
function projectNameFor(ventureId: string): string {
  return `atelier-${ventureId.slice(0, 8)}`;
}

/**
 * mission/run (SPEC.md §8.2) : contexte -> budget -> agent (usage métré, coupure
 * nette) -> actions -> waitForEvent('action.decided', 72h) par action C -> exécution
 * des approuvées via ActionExecutor -> clôture. Chaque transition d'état est
 * journalisée au ledger.
 */

type MissionStatus =
  | 'backlog'
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'budget_exceeded';

async function setMissionStatus(
  ventureId: string,
  missionId: string,
  status: MissionStatus,
  extra: Partial<{ startedAt: Date; endedAt: Date; resultSummary: string }> = {},
) {
  const { db } = getRuntime();
  await db
    .update(missions)
    .set({ status, ...extra })
    .where(eq(missions.id, missionId));
  await appendEvent(db, ventureId, 'mission_state', { missionId, status });
  await publish(db, ventureId, { type: 'mission.state', missionId, status });
}

export const missionRun = inngest.createFunction(
  {
    id: 'mission-run',
    retries: 0,
    concurrency: { limit: 1, key: 'event.data.missionId' },
    cancelOn: [{ event: 'mission.cancel', if: 'async.data.missionId == event.data.missionId' }],
    triggers: { event: 'mission.run' },
  },
  async ({ event, step }) => {
    const rt = getRuntime();
    const { db } = rt;
    const missionId = event.data.missionId as string;

    const loaded = await step.run('demarrer', async () => {
      const [row] = await db
        .select({
          mission: missions,
          ventureName: ventures.name,
          pitch: ventures.pitch,
        })
        .from(missions)
        .innerJoin(ventures, eq(ventures.id, missions.ventureId))
        .where(eq(missions.id, missionId));
      if (!row) throw new Error(`mission ${missionId} introuvable`);
      if (
        ['done', 'cancelled', 'failed', 'budget_exceeded', 'running'].includes(row.mission.status)
      ) {
        return null; // déjà traitée ou en cours : idempotence
      }
      await db
        .update(missions)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(missions.id, missionId));
      await appendEvent(db, row.mission.ventureId, 'mission_state', {
        missionId,
        status: 'running',
      });
      await publish(db, row.mission.ventureId, {
        type: 'mission.state',
        missionId,
        status: 'running',
      });
      return {
        ventureId: row.mission.ventureId,
        agentRole: row.mission.agentRole,
        title: row.mission.title,
        instruction: row.mission.instruction,
        ventureName: row.ventureName,
        pitch: row.pitch,
      };
    });
    if (!loaded) return { missionId, status: 'skipped' };
    const { ventureId } = loaded;

    // Exécution de l'agent — usage métré à chaque appel, coupure nette si dépassement.
    const execution = await step.run('executer-agent', async () => {
      const router = rt.routerFor(ventureId, { missionId });
      const tools = buildToolbox(rt, ventureId, { missionId });
      const buffer = createDeltaBuffer((text) =>
        publish(db, ventureId, { type: 'mission.delta', missionId, text }),
      );
      try {
        if (loaded.agentRole === 'builder') {
          // Builder (SPEC.md §8.2) : Claude Code headless en sandbox -> deploy_preview (B)
          // + deploy_prod (C). Les fichiers voyagent dans le payload (aperçu fidèle).
          const built = await runLandingBuilder({
            rt,
            ventureId,
            missionId,
            ventureName: loaded.ventureName,
            pitch: loaded.pitch,
            onDelta: (t) => buffer.push(t),
          });
          await buffer.end();
          const projectName = projectNameFor(ventureId);
          const deployPayload = {
            files: built.files,
            projectName,
            branch: 'atelier/landing',
            commitMessage: `Landing « ${loaded.ventureName} » par Atelier`,
          };
          await proposeAction(rt, {
            ventureId,
            missionId,
            kind: 'deploy_preview',
            payload: deployPayload,
          });
          await proposeAction(rt, {
            ventureId,
            missionId,
            kind: 'deploy_prod',
            payload: deployPayload,
          });
          return { killed: false as const, summary: built.summary };
        }
        const result = await executeMissionAgent({
          ctx: { ventureId, ventureName: loaded.ventureName, pitch: loaded.pitch, locale: 'fr' },
          mission: { id: missionId, ...loaded },
          router,
          tools,
          onDelta: (t) => buffer.push(t),
        });
        await buffer.end();
        return { killed: false as const, summary: result.summary };
      } catch (err) {
        await buffer.end();
        if (err instanceof BudgetExceededError) {
          // Annulation PROPRE : état terminal + ledger + notification, pas d'échec brutal.
          await setMissionStatus(ventureId, missionId, 'budget_exceeded', {
            endedAt: new Date(),
            resultSummary: err.message,
          });
          return { killed: true as const, summary: err.message };
        }
        await setMissionStatus(ventureId, missionId, 'failed', { endedAt: new Date() });
        throw err;
      }
    });
    if (execution.killed) return { missionId, status: 'budget_exceeded' };

    // Auto-exécution des actions sans approbation (classe A/B : deploy_preview auto + notif).
    const autoFailure = await step.run('auto-executer', async () => {
      const autoActions = await db
        .select()
        .from(actions)
        .where(
          and(
            eq(actions.missionId, missionId),
            eq(actions.status, 'pending'),
            eq(actions.requiresApproval, false),
          ),
        );
      for (const action of autoActions) {
        const executor = findExecutor(action.kind);
        if (!executor) {
          // Classe A (brouillon) : proposée, rien à exécuter côté serveur.
          await db
            .update(actions)
            .set({ status: 'auto_executed' })
            .where(eq(actions.id, action.id));
          continue;
        }
        try {
          const receipt = await executor.execute(action, rt);
          await db
            .update(actions)
            .set({ status: 'auto_executed', executedAt: new Date() })
            .where(and(eq(actions.id, action.id), eq(actions.status, 'pending')));
          await appendEvent(db, ventureId, 'action_executed', {
            actionId: action.id,
            kind: action.kind,
            auto: true,
            receipt: { summary: receipt.summary, externalUrl: receipt.externalUrl ?? null },
          });
          await publish(db, ventureId, {
            type: 'action.executed',
            actionId: action.id,
            kind: action.kind,
            summary: receipt.summary,
            externalUrl: receipt.externalUrl,
          });
        } catch (err) {
          // Échec d'exécution (repo inaccessible, Vercel en erreur…) : on ne bloque pas
          // la mission indéfiniment, on la termine proprement en failed.
          const message = (err as Error).message.slice(0, 300);
          await publish(db, ventureId, {
            type: 'action.error',
            actionId: action.id,
            kind: action.kind,
            message,
          });
          return { actionId: action.id, kind: action.kind, message };
        }
      }
      return null;
    });

    if (autoFailure) {
      await setMissionStatus(ventureId, missionId, 'failed', {
        endedAt: new Date(),
        resultSummary: `Échec d'exécution de ${autoFailure.kind} : ${autoFailure.message}`,
      });
      return { missionId, status: 'failed' };
    }

    // Actions C en attente -> la mission attend les décisions (72 h max chacune).
    const pendingC = await step.run('lister-actions-c', async () => {
      const rows = await db
        .select({ id: actions.id, kind: actions.kind })
        .from(actions)
        .where(
          and(
            eq(actions.missionId, missionId),
            eq(actions.status, 'pending'),
            eq(actions.requiresApproval, true),
          ),
        );
      if (rows.length > 0) {
        await setMissionStatus(ventureId, missionId, 'awaiting_approval');
      }
      return rows;
    });

    for (const pending of pendingC) {
      const decided = await step.waitForEvent(`attendre-decision-${pending.id}`, {
        event: 'action.decided',
        timeout: '72h',
        if: `async.data.actionId == "${pending.id}"`,
      });

      await step.run(`suite-decision-${pending.id}`, async () => {
        const [action] = await db.select().from(actions).where(eq(actions.id, pending.id));
        if (!action) return;

        if (decided === null) {
          // 72 h sans décision : expiration (SPEC.md §13).
          if (action.status === 'pending') {
            await db.update(actions).set({ status: 'expired' }).where(eq(actions.id, pending.id));
            await appendEvent(db, ventureId, 'action_decided', {
              actionId: pending.id,
              decision: 'expired',
            });
            await publish(db, ventureId, {
              type: 'action.decided',
              actionId: pending.id,
              decision: 'expired',
            });
          }
          return;
        }

        if (decided.data.decision !== 'approved' || action.status !== 'approved') {
          return; // rejetée : le statut et le ledger ont été posés par l'API.
        }

        // Exécution idempotente via l'ActionExecutor (les tokens restent côté serveur).
        const executor = findExecutor(action.kind);
        if (!executor) {
          throw new Error(`aucun ActionExecutor pour « ${action.kind} »`);
        }
        const receipt = await executor.execute(action, rt);
        await db
          .update(actions)
          .set({ status: 'executed', executedAt: new Date() })
          .where(and(eq(actions.id, pending.id), eq(actions.status, 'approved')));
        await appendEvent(db, ventureId, 'action_executed', {
          actionId: pending.id,
          kind: action.kind,
          receipt: { summary: receipt.summary, externalUrl: receipt.externalUrl ?? null },
        });
        await publish(db, ventureId, {
          type: 'action.executed',
          actionId: pending.id,
          kind: action.kind,
          summary: receipt.summary,
          externalUrl: receipt.externalUrl,
        });
      });
    }

    // Clôture : coût réel depuis usage_records (même table que la facturation, §11).
    await step.run('cloturer', async () => {
      const [spent] = await db
        .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
        .from(usageRecords)
        .where(eq(usageRecords.missionId, missionId));
      await db
        .update(missions)
        .set({ costActualUsd: Number(spent?.total ?? 0).toFixed(4) })
        .where(eq(missions.id, missionId));
      await setMissionStatus(ventureId, missionId, 'done', {
        endedAt: new Date(),
        resultSummary: execution.summary,
      });
    });

    return { missionId, status: 'done' };
  },
);
