import { encryptSecret } from '@atelier/core';
import { integrations, secrets } from '@atelier/db';
import { connectGithubInputSchema, connectVercelInputSchema } from '@atelier/shared';
import { apiError, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Connexion d'une intégration DE L'UTILISATEUR par token (SPEC.md §11). Le token est
 * validé auprès du service puis chiffré AES-256-GCM ; config ne contient jamais de secret.
 */

type RouteContext = { params: Promise<{ kind: string }> };

async function validateGithub(
  token: string,
  repo: string | undefined,
): Promise<{ config: Record<string, unknown> } | null> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'atelier-app',
  };
  const res = await fetch('https://api.github.com/user', { headers });
  if (!res.ok) return null;
  const user = (await res.json()) as { login?: string; id?: number };
  if (!user.login || !user.id) return null;

  // Repo optionnel : on vérifie qu'il existe et est accessible en écriture.
  if (repo) {
    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (!repoRes.ok) return null;
    const r = (await repoRes.json()) as { full_name?: string; permissions?: { push?: boolean } };
    if (!r.full_name || !r.permissions?.push) return null;
    return { config: { login: user.login, githubUserId: user.id, repo: r.full_name } };
  }
  return { config: { login: user.login, githubUserId: user.id } };
}

async function validateVercel(token: string): Promise<{ config: Record<string, unknown> } | null> {
  const res = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { user?: { username?: string; email?: string } };
  if (!body.user) return null;
  return { config: { username: body.user.username ?? body.user.email ?? '' } };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { kind } = await context.params;
  if (kind !== 'github' && kind !== 'vercel') {
    return apiError(
      400,
      'unsupported_integration',
      `L'intégration « ${kind} » n'est pas encore disponible.`,
      'En v1 : github et vercel sont connectables par token.',
    );
  }

  const env = getEnv();
  if (env.SECRETS_MASTER_KEY === '') {
    return apiError(
      503,
      'vault_unconfigured',
      'Le coffre à secrets n’est pas configuré sur ce serveur.',
      'Renseigne SECRETS_MASTER_KEY (voir .env.example) puis redémarre.',
    );
  }

  const schema = kind === 'github' ? connectGithubInputSchema : connectVercelInputSchema;
  const input = await parseJsonBody(request, schema);
  if (input instanceof Response) return input;

  let validated: { config: Record<string, unknown> } | null;
  try {
    const repo = (input as { repo?: string }).repo;
    validated =
      kind === 'github'
        ? await validateGithub(input.token, repo)
        : await validateVercel(input.token);
  } catch (err) {
    logger.error({ err, kind }, 'service injoignable pendant la validation du token');
    return apiError(502, 'service_unreachable', `${kind} est injoignable pour le moment.`);
  }
  if (!validated) {
    return apiError(
      422,
      'invalid_token',
      `${kind} a refusé ce token (ou le repo est inaccessible en écriture).`,
      kind === 'github'
        ? 'Token avec scope repo, et repo « owner/name » où tu as les droits de push.'
        : 'Génère un token Vercel valide, puis réessaie.',
    );
  }

  const sealed = encryptSecret(env.SECRETS_MASTER_KEY, input.token);
  const created = await getDb().transaction(async (tx) => {
    const [secret] = await tx
      .insert(secrets)
      .values({ userId: user.id, ciphertext: sealed.ciphertext, nonce: sealed.nonce })
      .returning({ id: secrets.id });
    if (!secret) throw new Error('insertion secret échouée');
    const [integration] = await tx
      .insert(integrations)
      .values({
        userId: user.id,
        kind,
        config: validated.config,
        secretId: secret.id,
      })
      .returning({
        id: integrations.id,
        kind: integrations.kind,
        config: integrations.config,
        status: integrations.status,
      });
    return integration;
  });

  return Response.json({ integration: created }, { status: 201 });
}
