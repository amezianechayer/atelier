# Démo Phase 2 — runtime d'agents + CEO/Researcher + onboarding

Prérequis : Phases 0-1 jouées, `.env` avec `ANTHROPIC_API_KEY` (obligatoire),
compose up (`docker compose -f docker/compose.dev.yml up -d`), migrations appliquées.

```bash
# 1. Lancer les deux apps (2 terminaux, ou pnpm dev à la racine)
pnpm --filter worker start     # endpoint Inngest sur :3111 (le dev server compose le découvre)
pnpm --filter web dev          # http://localhost:3000
```

## Scénario — l'onboarding « wow » (acceptation Phase 2)

1. Connecte-toi (magic link via Mailpit, voir phase-1.md) et crée une venture avec un
   pitch de 3 lignes (idée, cible, existant).
2. Tu es redirigé sur `/ventures/{id}/onboarding` : l'étude de marché du Researcher
   s'écrit **en streaming**, puis le plan du CEO (positionnement, ICP, 3 concurrents,
   pricing, nom + alternatives), les 4 memoryDocs (brand/icp/tone/product) et le
   backlog de ~10 missions priorisées.
3. La **jauge de budget** se met à jour en temps réel à chaque appel LLM
   (usage_records, prix datés de prices.yaml).
4. À la fin : lien vers le chat. Pose une question au CEO — il répond en streaming,
   en connaissant ton plan et ta mémoire.

## Mesures relevées (run du 2026-07-15, pitch « PawPlanner »)

| Critère d'acceptation | Exigence | Mesuré |
| --- | --- | --- |
| Durée pitch -> plan + backlog + memoryDocs | < 3 min | **94 s** |
| memoryDocs générés | brand/icp/tone/product | 4 ✓ |
| Backlog initial | 10 missions priorisées | 11 ✓ |
| Visible en streaming | SSE | 22 événements captés (deltas, plan, mémoire, backlog, done) ✓ |
| Coût mesuré et affiché | oui | **0,1629 $** (4 appels, jauge temps réel + total final) ✓ |

Équivalent scriptable :

```bash
# session via magic link (voir phase-1), puis :
curl -b cookies.txt -X POST localhost:3000/api/v1/ventures \
  -H "Content-Type: application/json" \
  -d '{"name":"Ma venture","pitch":"3 lignes: idée, cible, existant."}'
# -> { venture, onboardingQueued: true } ; suivre le flux :
curl -N -b cookies.txt localhost:3000/api/v1/ventures/{id}/stream
# coût : GET localhost:3000/api/v1/ventures/{id}/usage
# chat : POST localhost:3000/api/v1/chat/{id}/messages {"content":"..."}
```

## Notes

- Le Researcher utilise la **recherche web serveur d'Anthropic** (métrée : 0,01 $ par
  recherche, ADR 0005) — les études citent des sources réelles.
- Les embeddings (rappel sémantique, Phase 7) exigent un compte OpenAI crédité —
  le compte fourni est en `insufficient_quota` (ADR 0005).
- Inngest dev server : UI sur http://localhost:8288 (runs, retries, événements).
