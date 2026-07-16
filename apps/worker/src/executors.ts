import type { ActionExecutor } from '@atelier/core';

/**
 * Registre des ActionExecutor (SPEC.md §7). Les tokens des intégrations vivent ici,
 * côté serveur — jamais chez les agents. En Phase 3, seul un executor FACTICE existe
 * (acceptation : action C approuvée puis exécutée par un executor factice) ; les vrais
 * arrivent avec leurs intégrations (vercel/github en Phase 4, resend/buffer en Phase 5).
 */

const fakePublishPost: ActionExecutor = {
  canHandle: (kind) => kind === 'publish_post',
  async execute(action) {
    const text =
      typeof action.payload === 'object' && action.payload !== null
        ? String((action.payload as Record<string, unknown>).text ?? '')
        : '';
    return {
      summary: `Post publié (executor factice, Phase 3) — ${text.slice(0, 80)}…`,
      externalUrl: `fake://posts/${action.id}`,
    };
  },
  async undo() {
    // Dépublication factice : rien à faire.
  },
};

const EXECUTORS: ActionExecutor[] = [fakePublishPost];

export function findExecutor(kind: string): ActionExecutor | undefined {
  return EXECUTORS.find((e) => e.canHandle(kind));
}
