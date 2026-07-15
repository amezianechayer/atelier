# Démo Phase 1 — auth B2C + coffre + intégrations

Prérequis : Phase 0 jouée (compose up, migrations appliquées : `pnpm db:migrate`).

```bash
# 0. Secrets locaux (une fois)
cp .env.example .env
node -e "console.log('SECRETS_MASTER_KEY='+require('crypto').randomBytes(32).toString('base64'))"   # -> coller dans .env
node -e "console.log('BETTER_AUTH_SECRET='+require('crypto').randomBytes(32).toString('hex'))"      # -> coller dans .env

# 1. Lancer le serveur web
pnpm --filter web dev
```

## Scénario A — signup par magic link (sans aucun compte externe)

1. Ouvre http://localhost:3000/login, saisis un email, clique « Recevoir un lien magique ».
2. Ouvre Mailpit http://localhost:8025 : l'email « Ton lien de connexion Atelier » est là.
3. Clique le lien → redirection sur /app, session créée (cookie httpOnly SameSite=Lax).
4. Crée une venture (nom + pitch) : elle apparaît, avec un budget par défaut du plan free
   (2 $/mois) créé en base dans la même transaction.

Équivalent scriptable (prouvé) :

```bash
curl -s -X POST localhost:3000/api/auth/sign-in/magic-link \
  -H "Content-Type: application/json" -H "Origin: http://localhost:3000" \
  -d '{"email":"demo@test.local","callbackURL":"/app"}'
# lien dans Mailpit : GET localhost:8025/api/v1/messages puis /api/v1/message/{id}
# suivre l'URL avec un cookie jar -> 302 /app, puis :
curl -b cookies.txt -X POST localhost:3000/api/v1/ventures \
  -H "Content-Type: application/json" -d '{"name":"Ma venture","pitch":"Mon idée."}'   # 201
```

## Scénario B — signup Google

Nécessite des identifiants OAuth (console Google Cloud) dans .env :
`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, origine `http://localhost:3000`,
redirection `http://localhost:3000/api/auth/callback/google`. Le bouton Google
apparaît sur /login dès que les deux variables sont renseignées ; `users.google_sub`
est renseigné automatiquement à la création du compte.

## Scénario C — coffre + intégration GitHub

```bash
# token GitHub (fine-grained ou classic) du compte de test :
curl -b cookies.txt -X POST localhost:3000/api/v1/integrations/github/connect \
  -H "Content-Type: application/json" -d '{"token":"ghp_..."}'
# 201 : config = { login, githubUserId } — le token est chiffré AES-256-GCM en base,
# jamais stocké ni renvoyé en clair. Token invalide -> 422 actionnable.
```

## Garde-fous vérifiés

- `GET /api/v1/ventures` sans session → 401 ; ressource d'autrui → 404 uniforme.
- 2ᵉ venture en plan free → 403 `plan_limit` avec hint d'upgrade.
- `/app` sans session → redirection /login.

## Critères d'acceptation Phase 1

- [x] Magic link fonctionnel en local (UI + email Mailpit + session + venture créée)
- [x] Signup Google : implémenté, bouton conditionnel — à activer avec les identifiants
      OAuth du fondateur (scénario B)
- [x] Secret chiffré/déchiffré sous test (14 tests unitaires + roundtrip en base réelle)
- [x] Testcontainers verts (migrations complètes, coffre, trigger ledger)
