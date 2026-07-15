# ADR 0002 — Lint et format : Biome (plutôt qu'ESLint + Prettier)

Date : 2026-07-13
Statut : accepté
Contexte : SPEC.md §5 demande de trancher par ADR en Phase 0 entre Biome et ESLint+Prettier.

## Options

1. **Biome** — un seul outil (lint + format), un seul fichier de config, très rapide
   (Rust), règle `noExplicitAny` native alignée sur la discipline "zéro any" (§15.6).
2. **ESLint + Prettier** — écosystème de plugins plus large (typescript-eslint,
   eslint-plugin-react-hooks), mais deux outils à configurer et réconcilier, nettement
   plus lents sur un monorepo.

## Décision

Biome 2.x, configuré à la racine (`biome.json`), exécuté par `pnpm check` avant
typecheck/tests. `noExplicitAny` en erreur.

## Coût

Pas de règles type-aware à la typescript-eslint : c'est `tsc --noEmit` (strict +
noUncheckedIndexedAccess) qui porte cette responsabilité dans `pnpm check`. Si un besoin
de règle spécifique React/hooks apparaît en Phase 8, réévaluer par ADR.
