# ADR 0007 — Dépendances Phase 6 (night shift + Telegram)

Date : 2026-07-19
Statut : accepté

## Contexte

La Phase 6 (SPEC.md §16) ajoute le gateway Telegram (liaison de compte, chat CEO,
boutons inline Approve/Reject, brief du matin) et le cycle nocturne `nightshift/cycle`
(cron Inngest 15 min, §8.3). Le cron n'exige aucune dépendance nouvelle (Inngest 4.12
déjà en place, syntaxe `triggers: [{ cron: 'TZ=… */15 * * * *' }]` vérifiée sur la doc
du jour). Le bot Telegram exige une bibliothèque.

## Options

1. **grammY** — imposé par SPEC.md §5 (« grammY : bot Telegram, long polling v1,
   boutons inline »). TypeScript natif, `Bot`/`InlineKeyboard` intégrés, long polling
   par défaut (`bot.start()`), ~2 Mo, zéro dépendance native.
2. node-telegram-bot-api — plus ancien, typé via @types, callbacks legacy. Écarté.
3. Appels HTTPS bruts à l'API Bot — zéro dépendance mais réinvente retry/typing. Écarté.

## Décision

`grammy` **1.45.0** (vérifiée sur grammy.dev ce jour), dans `apps/worker` uniquement.
Le token `TELEGRAM_BOT_TOKEN` est **optionnel** dans l'env : absent, le worker démarre
sans bot (log explicite) — le produit ne casse pas pour qui ne veut pas de Telegram.

## Coût

+1 dépendance runtime dans worker. Long polling = un seul process autorisé par token
(contrainte documentée : ne pas lancer deux workers avec le même token).
