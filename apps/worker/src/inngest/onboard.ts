import type { AgentContext } from '@atelier/agents-kit';
import { budgets, missions, usageRecords, ventures } from '@atelier/db';
import { eq, sql } from 'drizzle-orm';
import { generateBacklog, generateVenturePlan } from '../agents/ceo';
import { runMarketResearch } from '../agents/researcher';
import { createDeltaBuffer, publish } from '../notify';
import { getRuntime } from '../runtime';
import { buildToolbox } from '../toolbox';
import { inngest } from './client';

/**
 * venture/onboard (SPEC.md §8.1) — le "wow" des 10 premières minutes.
 * Déclencheur : venture.created. Progression poussée en NOTIFY -> SSE.
 */
export const ventureOnboard = inngest.createFunction(
  {
    id: 'venture-onboard',
    retries: 1,
    concurrency: { limit: 3 },
    triggers: { event: 'venture.created' },
  },
  async ({ event, step }) => {
    const rt = getRuntime();
    const { db } = rt;
    const ventureId = event.data.ventureId as string;

    const ctx = await step.run('charger-contexte', async (): Promise<AgentContext> => {
      const [venture] = await db.select().from(ventures).where(eq(ventures.id, ventureId));
      if (!venture) throw new Error(`venture ${ventureId} introuvable`);
      return {
        ventureId,
        ventureName: venture.name,
        pitch: venture.pitch,
        locale: 'fr',
      };
    });

    // Garde-fou budget (la coupure nette recordUsage/hardExceeded arrive en Phase 3).
    await step.run('verifier-budget', async () => {
      const [budget] = await db.select().from(budgets).where(eq(budgets.ventureId, ventureId));
      const [spent] = await db
        .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
        .from(usageRecords)
        .where(eq(usageRecords.ventureId, ventureId));
      const remaining = Number(budget?.monthlyLimitUsd ?? 0) - Number(spent?.total ?? 0);
      if (remaining <= 0) {
        await publish(db, ventureId, {
          type: 'onboarding.error',
          message: 'Budget IA du mois épuisé — augmente ton plan pour lancer l’onboarding.',
        });
        throw new Error('budget épuisé');
      }
    });

    await step.run('annoncer-depart', () => publish(db, ventureId, { type: 'onboarding.started' }));

    // Étape 1 — Researcher : étude de marché streamée.
    const research = await step.run('researcher-etude', async () => {
      await publish(db, ventureId, { type: 'onboarding.section', section: 'research' });
      const router = rt.routerFor(ventureId);
      const tools = buildToolbox(rt, ventureId);
      const buffer = createDeltaBuffer((text) =>
        publish(db, ventureId, { type: 'onboarding.delta', section: 'research', text }),
      );
      const { research } = await runMarketResearch({
        ctx,
        router,
        tools,
        onDelta: (t) => buffer.push(t),
      });
      await buffer.end();
      return research;
    });

    // Étape 2 — CEO : positionnement, ICP, concurrents, pricing, noms.
    const plan = await step.run('ceo-plan', async () => {
      await publish(db, ventureId, { type: 'onboarding.section', section: 'plan' });
      const router = rt.routerFor(ventureId);
      const { plan } = await generateVenturePlan({ ctx, router, research });
      await publish(db, ventureId, { type: 'onboarding.plan', plan });
      return plan;
    });

    // Étape 3 — memoryDocs brand/icp/tone/product, versionnés.
    await step.run('memoire', async () => {
      const tools = buildToolbox(rt, ventureId);
      const docs: Array<[string, string]> = [
        [
          'brand',
          `# Marque\n\nNom recommandé : ${plan.names[0] ?? ctx.ventureName}\nAlternatives : ${plan.names.slice(1).join(', ')}\n\n## Positionnement\n${plan.positioning}\n\n## Concurrents\n${plan.competitors.map((c: { name: string; angle: string }) => `- ${c.name} — ${c.angle}`).join('\n')}`,
        ],
        ['icp', `# Client idéal\n\n${plan.icp}`],
        ['tone', `# Ton de marque\n\n${plan.tone}`],
        ['product', `# Produit v1\n\n${plan.productBrief}\n\n## Pricing\n${plan.pricing}`],
      ];
      for (const [slug, content] of docs) {
        await tools.memory.proposeDocUpdate(slug, content);
        await publish(db, ventureId, { type: 'onboarding.memory', slug });
      }
    });

    // Étape 4 — backlog initial de 10 missions priorisées.
    await step.run('backlog', async () => {
      await publish(db, ventureId, { type: 'onboarding.section', section: 'backlog' });
      const router = rt.routerFor(ventureId);
      const { backlog } = await generateBacklog({ ctx, router, plan });
      for (const m of backlog.missions) {
        await db.insert(missions).values({
          ventureId,
          agentRole: m.agentRole,
          title: m.title,
          instruction: m.instruction,
          origin: 'ceo_backlog',
          priority: m.priority,
        });
      }
      await publish(db, ventureId, {
        type: 'onboarding.backlog',
        missions: backlog.missions.map((m) => ({
          title: m.title,
          agentRole: m.agentRole,
          priority: m.priority,
        })),
      });
    });

    // Clôture : venture active + totaux (coût réel affiché, acceptation Phase 2).
    await step.run('terminer', async () => {
      await db.update(ventures).set({ status: 'active' }).where(eq(ventures.id, ventureId));
      const [spent] = await db
        .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
        .from(usageRecords)
        .where(eq(usageRecords.ventureId, ventureId));
      await publish(db, ventureId, {
        type: 'onboarding.done',
        totalCostUsd: Number(spent?.total ?? 0),
      });
    });

    return { ventureId, status: 'done' };
  },
);
