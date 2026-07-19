/**
 * Night shift (SPEC.md §8.3) : la sélection des missions de la nuit est du CODE,
 * jamais une décision du modèle. Le CEO propose un backlog priorisé ; ce module
 * décide combien de missions tiennent sous le plafond nuit — fail-closed.
 * L'application du plafond PENDANT l'exécution est faite par recordUsage
 * (remainingNightUsd sur le cycle ouvert, kill si épuisé).
 */

export interface NightMissionCandidate {
  id: string;
  priority: number;
  /** numeric Drizzle (string) ou null si le CEO n'a pas estimé. */
  costEstimateUsd: string | null;
}

export interface NightPlan {
  /** Plafond du cycle : min(plafond nuit, budget mensuel restant), jamais négatif. */
  budgetUsd: number;
  /** Ids de missions dans l'ordre d'exécution (priorité croissante, ordre stable). */
  selected: string[];
  /** Somme des estimations retenues pour la sélection. */
  estimatedUsd: number;
}

/** Estimation prudente appliquée quand une mission n'a pas d'estimation exploitable. */
export const DEFAULT_MISSION_ESTIMATE_USD = 0.25;

/** Nombre maximal de missions par nuit (défaut) — une nuit reste un sprint court. */
export const DEFAULT_MAX_NIGHT_MISSIONS = 3;

function estimateOf(candidate: NightMissionCandidate, fallbackUsd: number): number {
  const value = Number(candidate.costEstimateUsd);
  return Number.isFinite(value) && value > 0 ? value : fallbackUsd;
}

export function planNightCycle(input: {
  candidates: NightMissionCandidate[];
  nightLimitUsd: number;
  remainingMonthUsd: number;
  maxMissions?: number;
  defaultEstimateUsd?: number;
}): NightPlan {
  const budgetUsd = Math.max(0, Math.min(input.nightLimitUsd, input.remainingMonthUsd));
  const maxMissions = input.maxMissions ?? DEFAULT_MAX_NIGHT_MISSIONS;
  const fallbackUsd = input.defaultEstimateUsd ?? DEFAULT_MISSION_ESTIMATE_USD;

  // Tri par priorité croissante, stable sur l'ordre d'entrée (sort natif stable).
  const ordered = [...input.candidates].sort((a, b) => a.priority - b.priority);

  const selected: string[] = [];
  let estimatedUsd = 0;
  for (const candidate of ordered) {
    if (selected.length >= maxMissions) break;
    const estimate = estimateOf(candidate, fallbackUsd);
    if (estimatedUsd + estimate > budgetUsd) continue; // pas de dépassement, même partiel
    selected.push(candidate.id);
    estimatedUsd += estimate;
  }

  return { budgetUsd, selected, estimatedUsd };
}
