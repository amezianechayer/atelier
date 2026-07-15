# ADR 0005 — Dépendances Phase 2 + choix des modèles par rôle

Date : 2026-07-15
Statut : accepté
Contexte : Phase 2 = runtime d'agents (CEO, Researcher), model router sur Vercel AI SDK,
onboarding Inngest streamé en SSE (SPEC.md §16). Règle 15.6 : ADR par dépendance.

## Dépendances ajoutées

| Dépendance | Version | Où | Pourquoi |
| --- | --- | --- | --- |
| ai (Vercel AI SDK) | 7.0.22 | agents-kit | imposée par la spec (§5) — boucles d'agents, streaming, usage normalisé |
| @ai-sdk/anthropic | 4.0.15 | agents-kit | provider Anthropic officiel du AI SDK |
| @ai-sdk/openai | 4.0.14 | agents-kit | embeddings text-embedding-3-small (1024 dims, schéma §6) |
| inngest | 4.12.1 | apps/worker + apps/web | imposée par la spec (§5) — jobs durables, waitForEvent, crons |
| yaml | 2.9.0 | packages/config | parse de prices.yaml (zéro dépendance, ~pur TS) |

Écartées : hono (le serve() d'inngest/node suffit sur node:http) ; SDK resend (déjà en fetch, ADR 0004).

## Choix des modèles par rôle (config, modifiable par le fondateur)

Contrainte produit (SPEC §12) : coût IA réel < 40 % du prix du plan, budget free = 2 $/mois.
Prix du jour (vérifiés le 2026-07-15) : Opus 4.8 = 5/25 $ le Mtok ; Sonnet 5 = 3/15 $
(promo 2/10 $ jusqu'au 2026-08-31) ; Haiku 4.5 = 1/5 $.

| Rôle | Modèle | Justification |
| --- | --- | --- |
| ceo | claude-sonnet-5 | qualité quasi-Opus sur le raisonnement produit, tient la marge |
| researcher | claude-sonnet-5 | analyse marché + web search serveur Anthropic |
| marketer (P5) | claude-sonnet-5 | rédaction |
| builder (P4) | Claude Code headless | hors router |
| utilitaire (search, titres) | claude-haiku-4-5 | tâches mécaniques |

Opus 4.8 (`claude-opus-4-8`) reste sélectionnable par configuration du router si le
fondateur privilégie la qualité sur la marge. Le metering facture au prix CATALOGUE
(3/15) même pendant la promo : surestimer protège le budget utilisateur, jamais l'inverse.

## Recherche web

`Toolbox.web.search` s'appuie sur l'outil serveur **web search d'Anthropic**
(10 $/1000 recherches, aucun compte externe) plutôt qu'une API de recherche tierce :
zéro clé en plus, résultats cités, coût mesuré via la même facture Anthropic.
`web.fetch` est local avec allowlist en code + garde SSRF (SPEC §7, §11).

## Contrainte découverte

Le compte OpenAI du fondateur est en `insufficient_quota` : la clé s'authentifie mais ne
peut pas servir. Les embeddings (rappel sémantique) ne sont requis qu'en Phase 7 — le
module est livré testé (interface mockable) mais l'onboarding Phase 2 ne l'appelle pas.
Action fondateur avant Phase 7 : créditer platform.openai.com.
