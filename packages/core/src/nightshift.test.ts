import { describe, expect, it } from 'vitest';
import { planNightCycle } from './nightshift';

/** Candidat minimal : ce que le cycle lit du backlog. */
function m(id: string, priority: number, estimate: string | null) {
  return { id, priority, costEstimateUsd: estimate };
}

describe('planNightCycle — sélection EN CODE des missions de la nuit (SPEC.md §8.3)', () => {
  // Table : nom, entrée, sélection attendue (ordre inclus), budget attendu.
  const cases: Array<{
    name: string;
    candidates: ReturnType<typeof m>[];
    nightLimitUsd: number;
    remainingMonthUsd: number;
    maxMissions?: number;
    expectedIds: string[];
    expectedBudget: number;
  }> = [
    {
      name: 'cas nominal : cumule les estimations sous le plafond nuit, ordre de priorité',
      candidates: [m('a', 2, '0.40'), m('b', 1, '0.30'), m('c', 3, '0.50')],
      nightLimitUsd: 1.0,
      remainingMonthUsd: 10,
      expectedIds: ['b', 'a'], // 0.30 + 0.40 = 0.70 ; +0.50 dépasserait 1.00
      expectedBudget: 1.0,
    },
    {
      name: 'le budget mensuel restant borne le budget nuit',
      candidates: [m('a', 1, '0.40'), m('b', 2, '0.40')],
      nightLimitUsd: 1.0,
      remainingMonthUsd: 0.5,
      expectedIds: ['a'],
      expectedBudget: 0.5,
    },
    {
      name: 'budget mensuel épuisé => AUCUNE mission (fail-closed)',
      candidates: [m('a', 1, '0.10')],
      nightLimitUsd: 1.0,
      remainingMonthUsd: 0,
      expectedIds: [],
      expectedBudget: 0,
    },
    {
      name: 'plafond nuit à zéro => aucune mission',
      candidates: [m('a', 1, '0.10')],
      nightLimitUsd: 0,
      remainingMonthUsd: 10,
      expectedIds: [],
      expectedBudget: 0,
    },
    {
      name: 'sans estimation, une mission coûte l’estimation PAR DÉFAUT prudente (0.25)',
      candidates: [m('a', 1, null), m('b', 2, null), m('c', 3, null), m('d', 4, null)],
      nightLimitUsd: 0.6,
      remainingMonthUsd: 10,
      expectedIds: ['a', 'b'], // 0.25 + 0.25 = 0.50 ; la 3e dépasserait 0.60
      expectedBudget: 0.6,
    },
    {
      name: 'estimation invalide (0, négative, NaN) => estimation par défaut',
      candidates: [m('a', 1, '0'), m('b', 2, '-3'), m('c', 3, 'oops')],
      nightLimitUsd: 0.55,
      remainingMonthUsd: 10,
      expectedIds: ['a', 'b'], // 3 × 0.25 dépasserait 0.55
      expectedBudget: 0.55,
    },
    {
      name: 'jamais plus de maxMissions (défaut 3), même avec du budget',
      candidates: [m('a', 1, '0.01'), m('b', 2, '0.01'), m('c', 3, '0.01'), m('d', 4, '0.01')],
      nightLimitUsd: 5,
      remainingMonthUsd: 10,
      expectedIds: ['a', 'b', 'c'],
      expectedBudget: 5,
    },
    {
      name: 'maxMissions paramétrable',
      candidates: [m('a', 1, '0.01'), m('b', 2, '0.01')],
      nightLimitUsd: 5,
      remainingMonthUsd: 10,
      maxMissions: 1,
      expectedIds: ['a'],
      expectedBudget: 5,
    },
    {
      name: 'égalité de priorité : ordre d’entrée stable',
      candidates: [m('x', 1, '0.10'), m('y', 1, '0.10')],
      nightLimitUsd: 1,
      remainingMonthUsd: 10,
      expectedIds: ['x', 'y'],
      expectedBudget: 1,
    },
    {
      name: 'backlog vide => plan vide, budget quand même posé',
      candidates: [],
      nightLimitUsd: 1,
      remainingMonthUsd: 10,
      expectedIds: [],
      expectedBudget: 1,
    },
    {
      name: 'une seule mission trop chère pour la nuit => rien (pas de dépassement partiel)',
      candidates: [m('a', 1, '2.00')],
      nightLimitUsd: 1,
      remainingMonthUsd: 10,
      expectedIds: [],
      expectedBudget: 1,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const plan = planNightCycle({
        candidates: c.candidates,
        nightLimitUsd: c.nightLimitUsd,
        remainingMonthUsd: c.remainingMonthUsd,
        ...(c.maxMissions !== undefined ? { maxMissions: c.maxMissions } : {}),
      });
      expect(plan.selected).toEqual(c.expectedIds);
      expect(plan.budgetUsd).toBeCloseTo(c.expectedBudget, 6);
    });
  }

  it('propriété : le coût estimé cumulé de la sélection ne dépasse JAMAIS le budget nuit', () => {
    // Générateur déterministe (pas de flakiness) balayant 500 combinaisons.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 500; i++) {
      const candidates = Array.from({ length: Math.floor(rand() * 8) }, (_, k) =>
        m(`m${k}`, Math.floor(rand() * 5), rand() < 0.25 ? null : (rand() * 1.5 - 0.2).toFixed(2)),
      );
      const nightLimitUsd = Math.round(rand() * 200) / 100;
      const remainingMonthUsd = Math.round(rand() * 300) / 100;
      const plan = planNightCycle({ candidates, nightLimitUsd, remainingMonthUsd });

      const byId = new Map(candidates.map((cand) => [cand.id, cand]));
      const cost = plan.selected.reduce((sum, id) => {
        const cand = byId.get(id);
        const est = Number(cand?.costEstimateUsd);
        return sum + (Number.isFinite(est) && est > 0 ? est : 0.25);
      }, 0);

      expect(plan.budgetUsd).toBeLessThanOrEqual(Math.min(nightLimitUsd, remainingMonthUsd) + 1e-9);
      expect(cost).toBeLessThanOrEqual(plan.budgetUsd + 1e-9);
      expect(plan.selected.length).toBeLessThanOrEqual(3);
      // Aucun id inventé.
      for (const id of plan.selected) expect(byId.has(id)).toBe(true);
    }
  });
});
