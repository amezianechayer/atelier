# ADR 0001 — Versions relevées et divergences avec la spec

Date : 2026-07-13 (versions vérifiées sur le registre npm ce jour)
Statut : accepté
Règle : SPEC.md §15.5 — les noms/versions de la spec sont indicatifs, la doc du jour fait foi.

## Versions retenues (épinglées)

| Dépendance | Version | Note |
| --- | --- | --- |
| Node | 22 LTS (22.22 en dev) | conforme spec |
| pnpm | 11.12.0 | épinglé via `packageManager` |
| TypeScript | 5.9.3 | voir divergence 1 |
| Turborepo | 2.10.4 | |
| Next.js | 16.2.10 | voir divergence 2 |
| React | 19.2.7 | voir divergence 2 |
| Drizzle ORM / drizzle-kit | 0.45.2 / 0.31.10 | |
| pg | 8.22.0 | driver node-postgres (LISTEN/NOTIFY en Phase 2) |
| zod | 4.4.3 | la spec ne fixe pas de majeure |
| Biome | 2.5.3 | choisi par ADR 0002 |
| Vitest | 4.1.10 | |
| pino | 10.3.1 | |
| tsx | 4.23.1 | runner TS de dev pour worker et scripts db (dev only) |
| @testcontainers/postgresql | 12.0.4 | installé en Phase 1 |
| PostgreSQL | 16 (image pgvector/pgvector:pg16) | conforme spec |

Épinglée en Phase 6 : grammy 1.45.0 (vérifiée le 2026-07-19 sur grammy.dev, ADR 0007).

À vérifier au moment de leur phase : inngest 4.x (P2), better-auth 1.6.x (P1),
ai (Vercel AI SDK) 7.x (P2), dockerode 5.x (P4), Stripe (P8),
flags headless Claude Code sur code.claude.com/docs (P4).

## Divergences avec la spec

1. **TypeScript 5.9.3, pas 7.x.** TS 7 (compilateur natif) est sorti depuis la rédaction
   de la spec, mais la spec impose "TypeScript 5.x strict absolu" (§5, décision fondateur)
   et l'écosystème (plugin TS de Next, drizzle-kit) est validé sur 5.x. Réévaluer TS 7
   après la v1.
2. **Next.js 16 + React 19, pas Next 15 + React 18.** La spec (§3, §5) date d'avant
   Next 16 ; Next 15 impose déjà React 19, React 18 n'était donc pas tenable. Démarrer
   sur la majeure courante évite une migration certaine avant la Phase 8.
3. **Mailpit remplace MailHog** dans compose.dev.yml. MailHog n'est plus maintenu
   (dernière release 2020) et son image n'a pas de healthcheck exploitable ; Mailpit est
   son successeur de fait, mêmes ports (SMTP 1025, UI 8025).

## Coût

Divergences documentées ici et réévaluables par le fondateur ; aucun impact sur les
contrats de SPEC.md §6/§7 (schéma et interfaces inchangés).
