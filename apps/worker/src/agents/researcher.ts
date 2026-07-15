import type { AgentContext, ModelRouter, Toolbox } from '@atelier/agents-kit';
import { researcherSystemPrompt } from '@atelier/agents-kit';

/**
 * Researcher (SPEC.md §2.3) : étude de marché avec accès web.
 * Utilisé par l'onboarding (§8.1, étape 1) — streaming vers l'UI via onDelta.
 */
export async function runMarketResearch(input: {
  ctx: AgentContext;
  router: ModelRouter;
  tools: Toolbox;
  onDelta(text: string): Promise<void>;
}): Promise<{ research: string; costUsd: number }> {
  const { ctx, router, tools, onDelta } = input;

  // 1. Recherche web (outil serveur Anthropic, métré) — meilleure-effort :
  // une panne de recherche ne doit pas faire échouer l'onboarding.
  let sources = '';
  try {
    const results = await tools.web.search(
      `marché, concurrents et pricing pour : ${ctx.pitch.slice(0, 300)}`,
    );
    if (results.length > 0) {
      sources = results
        .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.snippet}`)
        .join('\n');
    }
  } catch {
    sources = '';
  }

  // 2. Synthèse streamée.
  const { text, costUsd } = await router.stream({
    role: 'researcher',
    system: researcherSystemPrompt(ctx),
    prompt:
      `Réalise une mini étude de marché pour cette idée :\n« ${ctx.pitch} »\n\n` +
      (sources !== ''
        ? `Résultats de recherche web (cite les URL pertinentes) :\n${sources}\n\n`
        : 'Aucun résultat web disponible : appuie-toi sur tes connaissances en le signalant.\n\n') +
      'Structure attendue (concise, ~350 mots max) :\n' +
      '## Marché\n## 3 concurrents\n## Pricing observé\n## Angle recommandé',
    maxOutputTokens: 1200,
    onDelta,
  });

  return { research: text, costUsd };
}
