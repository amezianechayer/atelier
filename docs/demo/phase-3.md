# Démo Phase 3 — couche de confiance (l'anti-Polsia)

Prérequis : Phases 0-2 jouées, compose up, worker (`pnpm --filter worker start`) et web
(`pnpm --filter web dev`) lancés, session magic link active (voir phase-1.md).

La classification A/B/C est du CODE (packages/core/src/approvals.ts), jamais une
décision du modèle. TDD strict : 57 tests core écrits avant l'implémentation, dont la
propriété « toute mutation d'un ledgerEvent casse verifyChain au bon seq ».

## Scénario 1 — mission tuée net par le budget

```bash
# Plafonne le budget juste au-dessus de la dépense actuelle :
docker exec atelier-dev-postgres-1 psql -U atelier -d atelier -c \
  "UPDATE budgets SET monthly_limit_usd = (SELECT round(sum(cost_usd)+0.05,2)
   FROM usage_records WHERE venture_id='<VID>') WHERE venture_id='<VID>'"
# Lance une mission depuis /ventures/<VID>/missions (ou POST /api/v1/missions/<MID>/run)
```

Résultat mesuré (run du 2026-07-16) : mission « Interviews terrain » ->
**budget_exceeded** après le premier appel LLM, résumé actionnable
(« Budget IA épuisé (reste -0.0126 $ ce mois) : exécution coupée net. »),
transition journalisée au ledger (running -> budget_exceeded). Restaure ensuite le
budget (`UPDATE budgets SET monthly_limit_usd=2.00 …`).

## Scénario 2 — action C : pending -> approuvée -> exécutée (executor factice)

1. Lance une mission **marketer** depuis /ventures/<VID>/missions.
2. Le Marketer rédige le post et le PROPOSE : action `publish_post` classe C
   **pending**, mission **awaiting_approval** (waitForEvent 72 h, expiration auto).
3. Ouvre /ventures/<VID>/actions : l'aperçu EXACT du post s'affiche. Clique Approuver
   (ou `POST /api/v1/actions/<AID>/approve`).
4. L'événement action.decided réveille mission/run : l'ActionExecutor factice exécute,
   l'action passe **executed**, la mission **done** avec son coût réel.

Ledger complet mesuré du flux (seq 1-7) :

```
1 mission_state queued      5 action_decided approved
2 mission_state running     6 action_executed publish_post
3 action_created publish_post   7 mission_state done
4 mission_state awaiting_approval
POST /api/v1/ventures/<VID>/ledger/verify -> {"ok":true}
```

## Scénario 3 — tampering SQL détecté au bon seq

```bash
pnpm --filter worker exec tsx scripts/tamper-demo.ts
```

Sortie mesurée : chaîne saine (`{ ok: true }`), falsification SQL du payload au seq 2
(trigger append-only désactivé par « l'attaquant »), puis
`verifyChain -> { ok: false, brokenAtSeq: 2 }` ✓. Export utilisateur du journal :
`GET /api/v1/ventures/<VID>/ledger/export` (JSONL, hashes hex vérifiables hors plateforme).

## Aussi livré

- `GET/PUT /api/v1/ventures/{id}/autonomy` : niveaux 0/1/2 par sous-classe avec caps
  (`{"maxEmailsPerDay":50}`, `{"maxUsd":10}`) appliqués en code contre les compteurs du jour.
- Expiration automatique des actions non décidées après 72 h (waitForEvent timeout).
- `POST /api/v1/missions/{id}/cancel` (cancelOn Inngest).
- recordUsage branché sur CHAQUE appel LLM du router (onboarding et chat inclus).

## Critères d'acceptation Phase 3

- [x] Mission tuée proprement par le budget (statut budget_exceeded + ledger + message)
- [x] Action C pending -> approuvée -> exécutée par un executor factice
- [x] Tampering SQL détecté par verifyChain au seq exact
