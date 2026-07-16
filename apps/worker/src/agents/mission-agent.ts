import type { AgentContext, ModelRouter, Toolbox } from '@atelier/agents-kit';
import { ceoSystemPrompt, researcherSystemPrompt } from '@atelier/agents-kit';

/**
 * Exécution générique d'une mission par rôle (SPEC.md §8.2, Phase 3).
 * Le Builder réel (Claude Code headless) arrive en Phase 4, le Marketer complet en
 * Phase 5 — ici chaque rôle produit son livrable et PROPOSE ses actions.
 */

function marketerSystemPrompt(ctx: { ventureName: string; pitch: string }): string {
  return `Tu es le Marketer de « ${ctx.ventureName} » (pitch : ${ctx.pitch}).
Tu rédiges des contenus prêts à publier, en français, percutants et honnêtes.
Tu PROPOSES : rien ne part sans l'accord du fondateur.`;
}

export async function executeMissionAgent(input: {
  ctx: AgentContext;
  mission: { id: string; agentRole: string; title: string; instruction: string };
  router: ModelRouter;
  tools: Toolbox;
  onDelta(text: string): Promise<void>;
}): Promise<{ summary: string; actionIds: string[] }> {
  const { ctx, mission, router, tools, onDelta } = input;
  const actionIds: string[] = [];

  switch (mission.agentRole) {
    case 'researcher': {
      let sources = '';
      try {
        const results = await tools.web.search(`${mission.title} — ${ctx.pitch.slice(0, 200)}`);
        sources = results.map((r) => `- ${r.title} (${r.url}) : ${r.snippet}`).join('\n');
      } catch {
        sources = '';
      }
      const { text } = await router.stream({
        role: 'researcher',
        system: researcherSystemPrompt(ctx),
        prompt: `Mission : ${mission.instruction}\n${sources ? `\nSources web :\n${sources}\n` : ''}\nLivre un rapport concis (~300 mots).`,
        maxOutputTokens: 1200,
        onDelta,
      });
      const proposed = await tools.actions.propose('research_report', {
        missionTitle: mission.title,
        report: text,
      });
      actionIds.push(proposed.actionId);
      return { summary: text, actionIds };
    }

    case 'marketer': {
      const { text } = await router.stream({
        role: 'marketer',
        system: marketerSystemPrompt(ctx),
        prompt: `Mission : ${mission.instruction}\nRédige LE contenu final, prêt à publier tel quel (pas de méta-commentaire).`,
        maxOutputTokens: 900,
        onDelta,
      });
      // Le contenu exact part en file d'approbation : aperçu fidèle (SPEC.md §6).
      const proposed = await tools.actions.propose('publish_post', { text });
      actionIds.push(proposed.actionId);
      return {
        summary: `Brouillon rédigé et proposé à ton approbation (classe ${proposed.class}).`,
        actionIds,
      };
    }

    case 'builder': {
      const { text } = await router.stream({
        role: 'builder',
        system: ceoSystemPrompt(ctx),
        prompt: `Mission : ${mission.instruction}\nLe Builder (Claude Code headless) arrive en Phase 4 : produis à la place une spécification technique concise (~250 mots) de ce qu'il devra construire.`,
        maxOutputTokens: 1000,
        onDelta,
      });
      return { summary: text, actionIds };
    }

    default: {
      const { text } = await router.stream({
        role: 'ceo',
        system: ceoSystemPrompt(ctx),
        prompt: `Mission : ${mission.instruction}\nLivre le résultat directement, concis.`,
        maxOutputTokens: 1000,
        onDelta,
      });
      return { summary: text, actionIds };
    }
  }
}
