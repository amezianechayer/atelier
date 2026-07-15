# ADR 0003 — Cycle "up/down/up" des migrations sans down natif drizzle-kit

Date : 2026-07-13
Statut : accepté
Contexte : le critère d'acceptation Phase 0 exige « drizzle-kit migrate up/down/up sans
erreur », mais drizzle-kit (0.31) ne génère ni n'exécute de down migrations.

## Options

1. Écrire un runner de migrations maison avec fichiers `.down.sql` appariés — réinvente
   drizzle-kit, double surface de bugs, s'éloigne de l'outil imposé par la spec.
2. **`db:reset` = drop des schémas `public` et `drizzle` + ré-application complète** —
   même garantie pratique (l'état "down" est l'état vierge), zéro maintenance, et le
   cycle up/down/up est prouvé en CI (job `migrations`).

## Décision

Option 2. `pnpm db:reset` (packages/db/src/reset.ts) refuse de s'exécuter si
`NODE_ENV=production`. Le job CI `migrations` enchaîne migrate → reset → migrate à chaque
push. En production, les migrations sont forward-only — cohérent avec le ledger
append-only (§15.8 : correction = événement correctif, jamais de retour arrière).

## Coût

Pas de rollback granulaire d'une seule migration en dev ; en pratique on régénère la
migration fautive avant merge (les migrations ne sont immuables qu'une fois sur main).
