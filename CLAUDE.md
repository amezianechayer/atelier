# ATELIER — règles de travail pour Claude Code

## Commandes

- `pnpm check` — typecheck + lint + tests (doit être vert avant CHAQUE commit)
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:reset` — migrations Drizzle
- `docker compose -f docker/compose.dev.yml up -d` — services de dev (postgres+pgvector, minio, inngest dev, mailpit)
- `pnpm dev` — lance apps/web et apps/worker

## Règles (section 15 de SPEC.md, normatives)

1. Lis SPEC.md en entier avant toute action. Trou dans la spec = question au fondateur + ADR, jamais d'invention silencieuse. Les décisions de la section 2 ne se rediscutent pas sans lui.
2. Une phase par session. Chaque phase se termine par : checklist d'acceptation cochée point par point, script docs/demo/phase-N.md reproductible, tag v0.N.0.
3. `pnpm check` (typecheck + lint + tests) vert avant CHAQUE commit. Commits conventionnels, petits.
4. TDD strict sur packages/core : classify, budget, ledger, outreach (quotas + suppression list) en tests table-driven écrits AVANT l'implémentation. Tests de propriété : toute mutation d'un ledgerEvent casse verifyChain ; aucun chemin de code ne peut envoyer un email présent dans suppressionList (test qui essaie par toutes les entrées publiques).
5. Vérifie la documentation officielle du jour AVANT chaque intégration : flags headless Claude Code (code.claude.com/docs), Inngest, Better Auth, Drizzle, Vercel AI SDK, grammY, Stripe, Vercel API, Resend, pgvector. Les noms d'API de cette spec sont indicatifs, la doc du jour fait foi. Consigne les versions dans docs/adr/0001-versions.md.
6. Aucune dépendance ajoutée sans ADR une page (contexte, options, décision, coût). TypeScript strict absolu, zéro any non justifié.
7. Zéro secret dans le repo, .env.example exhaustif, env validé par zod au boot (crash immédiat si invalide).
8. Les événements ledger ne se modifient jamais ; correction = événement correctif.
9. Erreurs utilisateur actionnables, ton produit chaleureux (B2C), i18n fr/en dès le début (fichiers JSON dans packages/shared).
10. README quickstart à jour à chaque phase ; démo jouable sur machine vierge en 3 commandes (pnpm install, docker compose up, pnpm dev).

## Repères d'architecture

- Logique métier critique (classify, budget, ledger, outreach) : `packages/core` uniquement — pur TS, zéro dépendance framework.
- Entrées/sorties validées par les schémas zod de `packages/shared`.
- `apps/web` n'exécute aucun travail long : il émet des événements Inngest, `apps/worker` les traite.
- Classification A/B/C des actions = CODE, jamais une décision du modèle.
- Secrets utilisateurs chiffrés AES-256-GCM : jamais au frontend, jamais dans les prompts d'agents.
