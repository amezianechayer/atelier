# Démo Phase 5 — Marketer + prospection conforme par construction

Prérequis : Phases 0-4 jouées, compose up, worker (`pnpm --filter worker start`) et web
(`pnpm --filter web dev`) lancés, session active (magic link, voir phase-1.md).

La conformité est appliquée EN CODE (SPEC.md §8.4, §11), jamais par le modèle :
- **suppression list globale** non contournable (packages/core/src/outreach.ts) ;
- **source des contacts obligatoire** (import refusé sinon) ;
- **quota du plan** par mois (SPEC.md §12) ;
- **lien + en-tête List-Unsubscribe** injectés à chaque email ;
- clic unsubscribe → suppression list globale (page publique, sans session).

TDD strict : 28 tests core écrits AVANT l'implémentation, dont la propriété « aucune
entrée de la suppression list ne passe, essayée par toutes les variantes de casse/espaces ».

## Scénario A — 3 posts en file d'approbation

```bash
curl -b cookies.txt -X POST localhost:3000/api/v1/ventures/<VID>/missions \
  -H "Content-Type: application/json" \
  -d '{"agentRole":"marketer","title":"Plan de contenu","instruction":"3 posts pour lancer la waitlist.","run":true}'
```

Le Marketer génère 3 posts distincts → 3 actions `publish_post` (classe C) **pending**
avec aperçu EXACT dans la file. À l'approbation : Buffer si connecté, sinon repli
« copier le post » (le produit ne bloque pas).

## Scénario B — batch d'emails conforme (acceptation)

```bash
# 1. Importer des contacts SOURCÉS (source obligatoire, sinon 400) :
curl -b cookies.txt -X POST localhost:3000/api/v1/ventures/<VID>/contacts \
  -H "Content-Type: application/json" \
  -d '{"source":"Salon Animal Expo 2026 (opt-in)","contacts":[{"email":"prospect1@test.local","firstName":"Alice"}, ...]}'

# 2. Mission de prospection (le mot « email/prospection » aiguille le Marketer) :
curl -b cookies.txt -X POST localhost:3000/api/v1/ventures/<VID>/missions \
  -H "Content-Type: application/json" \
  -d '{"agentRole":"marketer","title":"Prospection","instruction":"Un email de prospection pour PawPlanner.","run":true}'

# 3. Approuver l'action send_email_batch (classe C, aperçu = sujet + corps + destinataires) :
curl -b cookies.txt -X POST localhost:3000/api/v1/actions/<AID>/approve
```

## Scénario C — unsubscribe bloque TOUT envoi futur

```bash
# 1. Cliquer le lien « se désinscrire » d'un email reçu (page publique, sans session).
# 2. Réinitialiser les contacts (dev) puis relancer une mission de prospection et l'approuver.
# 3. Compter : le désinscrit ne reçoit RIEN, les autres oui.
```

## Mesures relevées (run du 2026-07-18, venture « PawPlanner »)

| Critère d'acceptation | Résultat |
| --- | --- |
| Import sans source | ✅ **400** « indique la provenance des contacts » |
| Quota du plan appliqué en code | ✅ plan `free` (0 email/mois) → **tout le batch bloqué par le quota**, 0 envoyé |
| 3 posts en file d'approbation | ✅ 3 actions `publish_post` **pending** (LinkedIn/Facebook/X), aperçu EXACT du texte, mission `awaiting_approval` |
| Batch d'emails envoyé après approbation | ✅ plan `starter`, 10 contacts sourcés → **9/10 emails** dans Mailpit (`prospect1@test.local` déjà en suppression list, retiré EN CODE), contacts → `contacted` |
| Lien + en-tête unsubscribe | ✅ `List-Unsubscribe: <…/unsubscribe?token=…>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` + lien dans le corps |
| Personnalisation | ✅ `{{firstName}}` remplacé dans le sujet ET le corps (« Alice, fini le carnet papier… ») |
| Clic unsubscribe bloque tout envoi futur | ✅ clic sur le lien de Bruno → suppression list = {prospect1, bruno.dogwalk} ; contacts remis à `new`, relance approuvée → **exactement 8 envoyés** (10 − 2 supprimés), Bruno : **1 email reçu au total** (aucune relance) |
| Page Réglages | ✅ `/settings` : connexion GitHub (token validé + repo) et Vercel (token validé) pour TOUTES les ventures ; Buffer « bientôt » avec repli copier-coller |

## Sécurité / conformité vérifiée

- La suppression list est la **seule barrière d'envoi** : `filterSendable` (core) est le
  seul chemin qui produit la liste d'envoi, et le test de propriété prouve qu'aucune
  variante d'un email supprimé n'y échappe.
- Le token unsubscribe est **HMAC stateless** (signé sur `SECRETS_MASTER_KEY`) : un token
  falsifié ou une mauvaise clé est rejeté — pas de désinscription d'un tiers.
- Le token Resend de l'utilisateur reste côté serveur (ActionExecutor) ; en dev sans
  Resend connecté, l'envoi retombe sur Mailpit.

## Critères d'acceptation Phase 5

- [x] Batch de 5 emails de test envoyé après approbation
- [x] Le clic unsubscribe bloque tout envoi futur, prouvé
- [x] 3 posts en file d'approbation avec aperçu exact
