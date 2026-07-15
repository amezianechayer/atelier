/**
 * @atelier/core — logique métier pure, zéro dépendance framework (SPEC.md §3).
 *
 * Modules à venir, en TDD strict table-driven écrit AVANT l'implémentation (SPEC.md §15.4) :
 * - approvals (Phase 3) : classify() A/B/C appliqué en CODE + interface ActionExecutor
 * - budget    (Phase 3) : recordUsage() avec coupure nette (hardExceeded)
 * - ledger    (Phase 3) : appendEvent / verifyChain / exportChain (chaînage SHA-256)
 * - missions  (Phase 3) : machine à états (SPEC.md §13)
 * - memory    (Phase 2) : docs versionnés + rappel sémantique
 * - outreach  (Phase 5) : quotas par plan + suppression list non contournable
 */

/** Classe d'action (SPEC.md §2.5) : A réversible/privé, B visible/réversible, C irréversible/public. */
export type ActionClass = 'A' | 'B' | 'C';

/** Niveau d'autonomie par sous-classe : 0 approbation, 1 auto+notif+undo, 2 auto plafonné. */
export type AutonomyLevel = 0 | 1 | 2;
