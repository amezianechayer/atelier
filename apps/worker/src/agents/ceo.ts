import type { AgentContext, ModelRouter } from '@atelier/agents-kit';
import { ceoSystemPrompt } from '@atelier/agents-kit';
import { z } from 'zod';

/**
 * CEO (SPEC.md §2.3) : plan d'onboarding (§8.1), backlog initial, chat avec le fondateur.
 */

export const planSchema = z.object({
  positioning: z.string().describe('Positionnement en 2-3 phrases'),
  icp: z.string().describe('Client idéal : qui, douleur, où le trouver'),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        angle: z.string().describe('En quoi on se différencie de lui'),
      }),
    )
    .min(2)
    .max(4)
    .describe('Exactement 3 concurrents si possible'),
  pricing: z.string().describe('Pricing proposé et justification courte'),
  names: z
    .array(z.string())
    .min(4)
    .max(8)
    .describe('Nom recommandé en premier, puis 5 alternatives'),
  tone: z.string().describe('Ton de marque en 2-3 adjectifs + une phrase d’exemple'),
  productBrief: z.string().describe('Le produit v1 en 4-5 phrases concrètes'),
});
export type VenturePlan = z.infer<typeof planSchema>;

export const backlogSchema = z.object({
  missions: z
    .array(
      z.object({
        title: z.string().max(80),
        instruction: z.string().describe('Une phrase actionnable pour l’agent'),
        agentRole: z.enum(['ceo', 'researcher', 'builder', 'marketer']),
        priority: z.number().int().min(1).max(5).describe('1 = le plus urgent'),
      }),
    )
    .min(8)
    .max(12)
    .describe('10 missions priorisées si possible'),
});
export type Backlog = z.infer<typeof backlogSchema>;

export async function generateVenturePlan(input: {
  ctx: AgentContext;
  router: ModelRouter;
  research: string;
}): Promise<{ plan: VenturePlan; costUsd: number }> {
  const { ctx, router, research } = input;
  const { object, costUsd } = await router.generateObject({
    role: 'ceo',
    system: ceoSystemPrompt(ctx),
    prompt:
      `À partir du pitch et de l'étude du Researcher, produis le plan de lancement.\n\n` +
      `Pitch : ${ctx.pitch}\n\nÉtude de marché :\n${research}\n\n` +
      'Vise exactement 3 concurrents et 6 noms (le recommandé en premier). Français, ton direct.',
    schema: planSchema,
    maxOutputTokens: 2000,
  });
  return { plan: object, costUsd };
}

export async function generateBacklog(input: {
  ctx: AgentContext;
  router: ModelRouter;
  plan: VenturePlan;
}): Promise<{ backlog: Backlog; costUsd: number }> {
  const { ctx, router, plan } = input;
  const { object, costUsd } = await router.generateObject({
    role: 'ceo',
    system: ceoSystemPrompt(ctx),
    prompt:
      'Décompose le lancement en 10 missions priorisées pour ton équipe ' +
      '(researcher, builder, marketer — pas de mission "ceo" sauf arbitrage).\n' +
      'La mission n°1 doit être : Builder — landing page + capture d’emails (waitlist).\n\n' +
      `Plan :\n${JSON.stringify(plan, null, 2)}`,
    schema: backlogSchema,
    maxOutputTokens: 2500,
  });
  return { backlog: object, costUsd };
}

export async function chatReply(input: {
  ctx: AgentContext;
  router: ModelRouter;
  memory: Array<{ slug: string; content: string }>;
  history: Array<{ role: 'user' | 'ceo' | 'system'; content: string }>;
  onDelta(text: string): Promise<void>;
}): Promise<{ text: string; costUsd: number }> {
  const { ctx, router, memory, history, onDelta } = input;
  const memoryBlock =
    memory.length > 0
      ? `Mémoire de la venture :\n${memory.map((d) => `### ${d.slug}\n${d.content}`).join('\n\n')}\n\n`
      : '';
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'Fondateur' : 'CEO'} : ${m.content}`)
    .join('\n');

  return router.stream({
    role: 'ceo',
    system: `${ceoSystemPrompt(ctx)}\n\n${memoryBlock}Réponds au dernier message du fondateur. Concret, chaleureux, max ~200 mots.`,
    prompt: transcript,
    maxOutputTokens: 800,
    onDelta,
  });
}
