# Démo Phase 0 — fondations

Reproductible sur machine vierge (prérequis : Node 22+, pnpm 11+, Docker, git).

```bash
git clone <repo> atelier && cd atelier

# 1. Installer
pnpm install

# 2. Services de dev (postgres16+pgvector, minio, inngest dev, mailpit)
docker compose -f docker/compose.dev.yml up -d
docker compose -f docker/compose.dev.yml ps   # attendre STATUS "healthy" partout

# 3. Qualité : typecheck + lint + tests
pnpm check

# 4. Migrations : up -> down -> up
pnpm db:migrate   # applique 0000 (extension vector), 0001 (schéma), 0002 (HNSW + trigger ledger)
pnpm db:reset     # "down" : drop schémas public+drizzle puis ré-application complète
pnpm db:migrate   # up idempotent : "No migrations to apply" attendu

# 5. Vérifications manuelles (optionnel)
docker exec atelier-dev-postgres-1 psql -U atelier -d atelier -c "\dt"          # 18 tables
docker exec atelier-dev-postgres-1 psql -U atelier -d atelier \
  -c "UPDATE ledger_events SET type='x'"                                        # doit échouer si des lignes existent (trigger append-only)

# 6. Apps squelettes
pnpm dev          # web sur :3000 (healthz: /api/v1/healthz), worker logge son boot
```

## Critères d'acceptation Phase 0

- [ ] `pnpm check` vert sur machine vierge
- [ ] `db:migrate` → `db:reset` → `db:migrate` sans erreur (prouvé aussi par le job CI `migrations`)
- [ ] `docker compose -f docker/compose.dev.yml ps` : tous les services `healthy`
- [ ] CI GitHub Actions verte (jobs `check` et `migrations`)
