/**
 * @atelier/agents-kit — runtime d'agents (Phase 2) : interfaces Agent/Toolbox (SPEC.md §7),
 * Model Router au-dessus du Vercel AI SDK (prix dans packages/config/prices.yaml, usage
 * normalisé -> recordUsage à CHAQUE appel), prompts, embeddings.
 */

/** Rôles fixes de l'équipe v1 (SPEC.md §2.3). */
export type AgentRole = 'ceo' | 'researcher' | 'builder' | 'marketer';
