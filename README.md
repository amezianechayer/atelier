# ATELIER

Plateforme SaaS multi-tenant pour solopreneurs et indie hackers : décris ton idée de
business, une équipe d'agents IA la planifie, la construit, la marchande et l'opère —
sur **tes** comptes (GitHub, Vercel, Resend), avec un budget IA plafonné et une file
d'approbation pour toute action irréversible.

La spécification complète vit dans [SPEC.md](SPEC.md). État actuel : **Phase 3
(couche de confiance : classification A/B/C en code, file d'approbation, coupure nette
au budget, ledger chaîné SHA-256 vérifiable)**.

Décris ton idée en 3 lignes → en ~90 secondes ton équipe d'agents produit une étude de
marché sourcée, un plan de lancement, la mémoire de la venture et un backlog de 10
missions — coût IA affiché au centime près pendant que ça tourne.

## Quickstart (3 commandes)

Prérequis : Node 22+, pnpm 11+, Docker.

```bash
pnpm install
docker compose -f docker/compose.dev.yml up -d
pnpm dev
```

Puis, la première fois, applique les migrations et génère tes secrets locaux :

```bash
cp .env.example .env
pnpm db:migrate
# coffre + auth (coller les sorties dans .env) :
node -e "console.log('SECRETS_MASTER_KEY='+require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('BETTER_AUTH_SECRET='+require('crypto').randomBytes(32).toString('hex'))"
```

Connexion : http://localhost:3000/login — magic link livré dans Mailpit (http://localhost:8025)
en dev. Le bouton Google apparaît si `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` sont renseignés
(voir docs/demo/phase-1.md). Les agents exigent `ANTHROPIC_API_KEY` dans `.env`
(voir docs/demo/phase-2.md). UI Inngest : http://localhost:8288.

- Web : http://localhost:3000 — healthcheck : http://localhost:3000/api/v1/healthz
- Inngest dev server : http://localhost:8288
- MinIO console : http://localhost:9001 (minioadmin/minioadmin)
- Mailpit (emails de dev) : http://localhost:8025

## Commandes

| Commande | Effet |
| --- | --- |
| `pnpm check` | typecheck + lint + tests (obligatoire avant commit) |
| `pnpm db:generate` | génère une migration depuis le schéma Drizzle |
| `pnpm db:migrate` | applique les migrations |
| `pnpm db:reset` | drop + réapplique tout (dev uniquement) |

## Layout

```
apps/web        Next.js (UI, auth, API REST /api/v1, SSE)
apps/worker     Node 22 (Inngest, agents, sandbox, Telegram)
packages/db     schéma Drizzle + migrations (PostgreSQL 16 + pgvector)
packages/core   logique métier pure (approvals, budget, ledger, outreach)
packages/*      agents-kit, integrations, shared (zod + i18n), config (env)
templates/      gabarits de ventures (landing, vitrine, micro-saas)
docker/         compose de dev + image sandbox du Builder
docs/           ADR + scripts de démo par phase
```
