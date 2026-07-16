# ADR 0006 — Builder Phase 4 : sandbox, headless, déploiement

Date : 2026-07-16
Statut : accepté
Contexte : Phase 4 = Builder (Claude Code headless en sandbox Docker durcie, templates,
intégrations GitHub + Vercel réelles, workflow 8.2). Règles 15.5 (doc du jour) et 15.6 (ADR).

## Dépendances ajoutées

| Dépendance | Version | Où | Pourquoi |
| --- | --- | --- | --- |
| dockerode | 5.0.1 | apps/worker | imposée par la spec (§5) — pilote la sandbox du Builder |
| @types/dockerode | 4.0.1 | apps/worker (dev) | types |
| tar-stream | 3.2.0 | apps/worker | tar in-memory pour putArchive/getArchive dockerode (injecter le template, extraire les fichiers personnalisés) — évite les bind-mounts hôte fragiles sur Docker Desktop Windows |
| @types/tar-stream | 3.1.4 | apps/worker (dev) | types |

Écartées : SDK GitHub (Octokit) et SDK Vercel — l'API REST en `fetch` suffit (github :
`/user/repos`, `/repos/{o}/{r}` ; vercel : `POST /v13/deployments` inline files), zéro
dépendance, cohérent avec resend/openai déjà en fetch.

## Doc du jour vérifiée (2026-07-16)

- **Claude Code headless** (code.claude.com/docs) : `claude --bare -p "<prompt>"
  --output-format stream-json --verbose --permission-mode acceptEdits`. `--bare` (recommandé
  pour scripts) saute la découverte de CLAUDE.md/hooks/MCP, auth par `ANTHROPIC_API_KEY`.
  L'événement `result` final porte `total_cost_usd` et l'usage → metering.
- **Vercel** : `POST /v13/deployments` avec `files:[{file,data,encoding?}]` (inline, `data`
  = contenu brut par défaut utf-8), `projectSettings:{framework:"nextjs"}`, `target:"production"`
  (omis = preview). Réponse : `id`, `url`, `readyState`, `alias`. On poll `readyState` jusqu'à
  READY/ERROR. Sondé et validé le 2026-07-16 (déploiement statique READY, URL réelle).

## Décision de sécurité (SPEC §11) — la sandbox ne détient JAMAIS les tokens utilisateur

Séparation stricte agent / executor :
- **Sandbox** (Claude Code) : personnalise le template selon la mémoire de la venture. Reçoit
  UNIQUEMENT `ANTHROPIC_API_KEY`. Egress deny-by-default : réseau Docker `internal`, seule
  sortie = un proxy CONNECT à allowlist `api.anthropic.com`. Durcissement : non-root, CapDrop
  ALL, ReadonlyRootfs (tmpfs pour /workspace, /tmp, $HOME), PidsLimit, Memory, NanoCpus,
  timeout dur, pas de socket Docker monté, télémétrie Claude Code désactivée.
- **Host / ActionExecutor** : détient les tokens GitHub/Vercel (déchiffrés du coffre). Fait le
  git push (repo AU NOM de l'utilisateur) et le déploiement Vercel. Les fichiers transitent par
  putArchive/getArchive (tar) — pas de bind-mount hôte (portabilité Windows/Docker Desktop).

Le build Next.js tourne côté **Vercel** (framework nextjs), pas dans la sandbox : l'allowlist
egress se réduit donc à `api.anthropic.com` (pas besoin du registre npm dans la sandbox).

## Périmètre v1 (SPEC §2.4)

Le Builder part de `templates/` (landing waitlist, vitrine) et les personnalise — pas de
génération « n'importe quelle app ». Preview = classe B (auto + notif), prod = classe C (gated).
