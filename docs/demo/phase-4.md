# Démo Phase 4 — Builder (Claude Code headless + sandbox + déploiement réel)

Prérequis : Phases 0-3 jouées, `.env` avec `ANTHROPIC_API_KEY`, Docker lancé, compose up,
worker + web démarrés. Image sandbox construite :

```bash
docker build -t atelier/sandbox:dev docker/sandbox
```

Comptes de l'utilisateur (fournis par le fondateur, SPEC §14) :
- token GitHub (scope repo) + un repo cible « owner/name »,
- token Vercel.

## Le flux « crée ma landing » (acceptation Phase 4)

1. Connecte tes comptes (une fois) :

```bash
curl -b cookies.txt -X POST localhost:3000/api/v1/integrations/github/connect \
  -H "Content-Type: application/json" -d '{"token":"ghp_...","repo":"owner/mon-repo"}'
curl -b cookies.txt -X POST localhost:3000/api/v1/integrations/vercel/connect \
  -H "Content-Type: application/json" -d '{"token":"vcp_..."}'
```

2. Depuis le chat (ou l'API), lance la mission Builder :

```bash
curl -b cookies.txt -X POST localhost:3000/api/v1/ventures/<VID>/missions \
  -H "Content-Type: application/json" \
  -d '{"agentRole":"builder","title":"Crée ma landing","instruction":"Crée ma landing page avec waitlist.","run":true}'
```

3. Ce qui se passe (SPEC §8.2), visible en SSE sur `/ventures/<VID>/stream` :
   - **Sandbox durcie** : Claude Code headless personnalise `content.json` du template
     landing (jamais le code React) selon la mémoire de la venture. Coût réel métré.
   - **deploy_preview** (classe B, auto + notif) : push sur une branche du repo AU NOM de
     l'utilisateur + déploiement **préversion Vercel** → URL réelle.
   - **deploy_prod** (classe C) : proposée **pending**, la mission passe `awaiting_approval`.
4. Approuve la production dans la file d'approbation (un tap) :

```bash
curl -b cookies.txt -X POST localhost:3000/api/v1/actions/<deploy_prod_id>/approve
```

   → merge sur `main` + déploiement **production Vercel**, mission `done`.
5. Vérifie : `POST /ventures/<VID>/ledger/verify` → `{"ok":true}` ; le repo montre la
   landing sur GitHub ; les URL préversion et prod servent la page personnalisée.

## Fumées reproductibles (composants vérifiés en isolation)

```bash
# Sandbox seule : Claude Code personnalise content.json dans le conteneur durci.
pnpm --filter worker exec tsx scripts/sandbox-smoke.ts

# Déploiement seul : push (repo vide amorcé) + préversion Vercel READY.
GH_TOKEN=ghp_... VERCEL_TOKEN=vcp_... GH_REPO=owner/repo \
  pnpm --filter worker exec tsx scripts/deploy-smoke.ts
```

Mesures relevées (2026-07-16, venture « PawPlanner ») :

| Composant | Résultat |
| --- | --- |
| Sandbox (Claude Code headless, conteneur durci, egress proxy allowlist) | content.json réécrit, **25 s**, **0,097 $**, `isError:false` |
| Egress deny-by-default | Claude Code joint api.anthropic.com UNIQUEMENT via le proxy CONNECT |
| Push GitHub (repo vide amorcé via Contents API puis Git Data API) | commit réel sur la branche `atelier/landing` |
| Déploiement préversion Vercel (fichiers inline, framework nextjs) | état **READY**, URL réelle servie |

## Sécurité vérifiée (SPEC §11)

- La sandbox ne reçoit QUE `ANTHROPIC_API_KEY` : aucun token GitHub/Vercel n'y entre
  (ils sont chargés côté serveur par les ActionExecutor, déchiffrés du coffre AES-GCM).
- Conteneur durci : non-root, `CapDrop ALL`, no-new-privileges, rootfs read-only
  (/workspace = volume nommé, /tmp et $HOME = tmpfs), limites CPU/mémoire/pids, timeout
  dur, pas de socket Docker monté, egress via proxy allowlist `api.anthropic.com`.

## Critères d'acceptation Phase 4

- [ ] « crée ma landing » → URL de préversion réelle sur le Vercel de test
- [ ] Après approbation → déploiement production sur le Vercel de test
- [ ] Repo visible sur le GitHub de test (landing personnalisée)
- [ ] Ledger complet du flux (sandbox → preview → approbation → prod), verifyChain ok
