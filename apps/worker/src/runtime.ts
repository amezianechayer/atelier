import {
  createModelRouter,
  createWebFetch,
  createWebSearch,
  type ModelRouter,
  type RouterRole,
  type UsageEvent,
} from '@atelier/agents-kit';
import { type Env, loadDotEnv, loadEnv } from '@atelier/config';
import { computeCostUsd, loadPrices } from '@atelier/config/prices';
import { recordUsage as coreRecordUsage } from '@atelier/core';
import { createDb, type Db } from '@atelier/db';
import { publish } from './notify';

/** Levée quand recordUsage signale hardExceeded : l'appelant DOIT annuler la mission. */
export class BudgetExceededError extends Error {
  constructor(public readonly remainingMonthUsd: number) {
    super(
      `Budget IA épuisé (reste ${remainingMonthUsd.toFixed(4)} $ ce mois) : exécution coupée net.`,
    );
    this.name = 'BudgetExceededError';
  }
}

/** Modèle par rôle — décision ADR 0005, ajustable par le fondateur. */
export const MODELS: Record<RouterRole, string> = {
  ceo: 'claude-sonnet-5',
  researcher: 'claude-sonnet-5',
  marketer: 'claude-sonnet-5',
  builder: 'claude-sonnet-5', // indicatif : le Builder passe par Claude Code headless (Phase 4)
  utility: 'claude-haiku-4-5',
};

/** Allowlist de web.fetch, appliquée EN CODE (SPEC.md §7). Étendre par ADR. */
export const WEB_ALLOWLIST = [
  'wikipedia.org',
  'github.com',
  'producthunt.com',
  'news.ycombinator.com',
  'reddit.com',
  'medium.com',
  'substack.com',
  'indiehackers.com',
];

export interface Runtime {
  env: Env;
  db: Db;
  cost(model: string, inputTokens: number, outputTokens: number): number;
  /** Router dont CHAQUE usage est persisté dans usage_records + poussé en NOTIFY. */
  routerFor(ventureId: string, opts?: { missionId?: string }): ModelRouter;
  webSearchFor(ventureId: string): ReturnType<typeof createWebSearch>;
  webFetch: ReturnType<typeof createWebFetch>;
  recordUsage(ventureId: string, usage: UsageEvent, missionId?: string): Promise<void>;
}

let cached: Runtime | undefined;

export function getRuntime(): Runtime {
  if (cached) return cached;

  loadDotEnv();
  const env = loadEnv();
  if (env.ANTHROPIC_API_KEY === '') {
    throw new Error(
      'ANTHROPIC_API_KEY manquante : les agents ne peuvent pas fonctionner. Renseigne-la dans .env (voir .env.example).',
    );
  }
  const { db } = createDb(env.DATABASE_URL);
  const prices = loadPrices();
  const cost = (model: string, input: number, output: number) =>
    computeCostUsd(prices, model, input, output);

  async function recordUsage(ventureId: string, usage: UsageEvent, missionId?: string) {
    // Compteur électrique (SPEC.md §7) : persiste ET vérifie le plafond à CHAQUE appel.
    const outcome = await coreRecordUsage(db, {
      ventureId,
      ...(missionId ? { missionId } : {}),
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    });
    await publish(db, ventureId, {
      type: 'usage',
      costUsd: usage.costUsd,
      model: usage.model,
      remainingMonthUsd: outcome.remainingMonthUsd,
    });
    if (outcome.hardExceeded) {
      throw new BudgetExceededError(outcome.remainingMonthUsd);
    }
  }

  cached = {
    env,
    db,
    cost,
    recordUsage,
    routerFor(ventureId, opts) {
      return createModelRouter({
        anthropicApiKey: env.ANTHROPIC_API_KEY,
        models: MODELS,
        computeCostUsd: cost,
        onUsage: (usage) => recordUsage(ventureId, usage, opts?.missionId),
      });
    },
    webSearchFor(ventureId) {
      return createWebSearch({
        apiKey: env.ANTHROPIC_API_KEY,
        model: MODELS.utility,
        computeCostUsd: cost,
        onUsage: (usage) => recordUsage(ventureId, usage),
      });
    },
    webFetch: createWebFetch({ allowlist: WEB_ALLOWLIST }),
  };
  return cached;
}
