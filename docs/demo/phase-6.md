# Démo Phase 6 — Night shift + Telegram

Prérequis : Phases 0-5 jouées, compose up, worker et web lancés, session active.
Pour le volet Telegram : un bot BotFather (`TELEGRAM_BOT_TOKEN` dans `.env`), le
worker relancé, ton compte lié (Réglages → Telegram → code → `/start CODE` au bot).

Le cycle nocturne (SPEC.md §8.3) est appliqué EN CODE :
- **sélection des missions** : `planNightCycle` (packages/core, 12 tests TDD dont une
  propriété sur 500 combinaisons : le cumul estimé ne dépasse JAMAIS le plafond nuit) ;
- **plafond nuit pendant l'exécution** : `recordUsage` voit le cycle ouvert et tue la
  mission (`budget_exceeded`) si `remainingNightUsd <= 0` — chaque appel modèle est vérifié ;
- **une seule nuit par venture** : cron 15 min (`TZ=UTC */15 * * * *`) qui écarte les
  ventures avec un cycle ouvert ou servi dans les 20 dernières heures ;
- les actions de classe C s'empilent dans la file (AUCUNE ne s'exécute sans accord) :
  le cycle enchaîne sur l'événement `mission.settled`, les `waitForEvent` 72 h restent armés.

## Scénario A — cycle nocturne simulé

```bash
# 1. Activer la night shift (cockpit → panneau 🌙 Night shift, ou PATCH) :
curl -b cookies.txt -X PATCH localhost:3000/api/v1/ventures/<VID> \
  -H "Content-Type: application/json" \
  -d '{"nightShiftEnabled":true,"nightShiftHourLocal":2,"briefChannel":"telegram"}'

# 2. Attendre le tick du cron (≤15 min à l'heure choisie) OU simuler :
curl -X POST localhost:8288/e/dev -H "Content-Type: application/json" \
  -d '{"name":"nightshift.venture","data":{"ventureId":"<VID>"}}'
```

Observé dans le bandeau terminal du cockpit : `night shift · départ (plafond 1.00 $)`,
puis les missions en séquence (researcher → marketer → builder), les actions C
empilées, et `☀️ brief du matin envoyé`.

## Scénario B — brief sur Telegram + approbation en un tap

Avec `briefChannel: telegram` et le compte lié : le brief du matin arrive dans le chat
du bot avec des boutons inline `✓ Post 1 / ✕ Post 1…` par action en attente. Taper
`✓` approuve : même chemin que le web (statut + ledger `action_decided` via=telegram +
événement `action.decided` qui réveille le `waitForEvent` de la mission) → exécution.

Le bot répond aussi au chat libre (CEO de la venture active, `/ventures`, `/venture N`)
et `/start CODE` lie le compte (code généré dans Réglages, 15 min, usage unique).

## Scénario C — plafond nuit prouvé

`night_cycles.spent_usd <= night_cycles.budget_usd` après le cycle, mesuré en SQL :

```sql
SELECT budget_usd, spent_usd, missions_run, ended_at IS NOT NULL AS ended
FROM night_cycles ORDER BY started_at DESC LIMIT 1;
```

Et avant CHAQUE mission le cycle recontrôle le restant (arrêt anticipé consigné au
ledger `night_cycle` phase=end `stoppedEarly`).

## Mesures relevées (run du 2026-07-19, venture « PawPlanner »)

| Critère d'acceptation | Résultat |
| --- | --- |
| Cycle nocturne simulé | ✅ 3 missions séquentielles (researcher → marketer → builder) : 1 `done`, 2 `awaiting_approval` ; le Builder a AUTO-déployé une préversion (classe B, URL Vercel réelle) et empilé `deploy_prod` (C) ; ledger `night_cycle` start+end ; terminal cockpit : « night shift · fin — 0.23 $ dépensés, 4 à approuver » |
| Brief du matin | ✅ généré et envoyé (`brief_sent_at` non nul) : fait (1) / en attente d'accord (4) / dépensé 0.23 $ sur 1.00 $ / appris ; visible dans le panneau 🌙 du cockpit ; **sur Telegram : voir scénario B (nécessite le token du fondateur)** |
| Approbation d'un post depuis Telegram | ⏳ à jouer avec le fondateur (bot + compte lié), le chemin code est identique au web (`decideFromTelegram` = statut + ledger + `action.decided`) |
| Dépense nuit ≤ plafond | ✅ **spent 0.2270 $ ≤ budget 1.00 $** (`SELECT spent_usd <= budget_usd` → `t`), 6 actions produites dont AUCUNE classe C exécutée sans accord ; sélection bornée prouvée par 12 tests core (propriété : jamais de cumul estimé > plafond) |
