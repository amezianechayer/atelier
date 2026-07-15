# ADR 0004 — Dépendances ajoutées en Phase 1

Date : 2026-07-15
Statut : accepté
Contexte : Phase 1 = auth B2C (Google + magic link), coffre secrets, intégrations,
Testcontainers, OTel (SPEC.md §16). Règle 15.6 : toute dépendance passe par ADR.

## Ajoutées

| Dépendance | Version | Où | Pourquoi |
| --- | --- | --- | --- |
| better-auth | 1.6.23 | apps/web | imposée par la spec (§5) — Google OAuth + magic link, sessions cookie httpOnly |
| @better-auth/drizzle-adapter | 1.6.23 | apps/web | l'adaptateur Drizzle vit désormais dans un package séparé (doc du jour) |
| @testcontainers/postgresql | 12.0.4 | packages/db (dev) | imposée par la spec (§5) — tests d'intégration sur un vrai Postgres pgvector |
| @opentelemetry/sdk-node | 0.220.0 | apps/worker | imposée par la spec (§5) — traces, export OTLP optionnel |
| @opentelemetry/exporter-trace-otlp-http | 0.220.0 | apps/worker | exporteur OTLP http |
| @opentelemetry/api | 1.9.1 | apps/worker | API stable OTel |
| @atelier/core (workspace, dev) | — | packages/db | le test d'intégration Testcontainers vérifie le roundtrip du coffre en base |

## Écartées volontairement

- **nodemailer** : l'envoi d'email de dev passe par l'API HTTP de Mailpit
  (`POST /api/v1/send`) et l'envoi de prod par l'API REST de Resend
  (`POST https://api.resend.com/emails`), les deux via `fetch` natif — zéro dépendance.
- **resend (SDK)** : même raison ; un POST JSON suffit en Phase 1, réévaluer en Phase 5
  (batches, bounces).
- **shadcn/ui** : pages login/app volontairement minimales ; l'UI complète est en Phase 8.

## Coût

better-auth apporte ses 4 tables (users étendue, sessions, accounts, verifications) —
additives au schéma contractuel de SPEC.md §6, ids UUID générés par Postgres
(`generateId: false`) pour rester cohérent avec le reste du schéma.
