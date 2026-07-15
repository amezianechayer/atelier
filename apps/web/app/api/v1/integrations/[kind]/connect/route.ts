import { encryptSecret } from '@atelier/core';
import { integrations, secrets } from '@atelier/db';
import { connectGithubInputSchema } from '@atelier/shared';
import { apiError, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

type RouteContext = { params: Promise<{ kind: string }> };

/** Vérifie le token auprès de GitHub et récupère le login (jamais stocké en clair). */
async function validateGithubToken(
  token: string,
): Promise<{ login: string; githubUserId: number } | null> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'atelier-app',
    },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { login?: string; id?: number };
  return body.login && body.id ? { login: body.login, githubUserId: body.id } : null;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { kind } = await context.params;
  if (kind !== 'github') {
    return apiError(
      400,
      'unsupported_integration',
      `L'intégration « ${kind} » n'est pas encore disponible.`,
      'En v1, seule github est connectable par token.',
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

  const input = await parseJsonBody(request, connectGithubInputSchema);
  if (input instanceof Response) return input;

  let github: Awaited<ReturnType<typeof validateGithubToken>>;
  try {
    github = await validateGithubToken(input.token);
  } catch (err) {
    logger.error({ err }, 'GitHub injoignable pendant la validation du token');
    return apiError(
      502,
      'github_unreachable',
      'GitHub est injoignable pour le moment.',
      'Réessaie dans quelques instants.',
    );
  }
  if (!github) {
    return apiError(
      422,
      'invalid_token',
      'GitHub a refusé ce token.',
      'Génère un token (classic ou fine-grained) avec le scope repo, puis réessaie.',
    );
  }

  // Le token part chiffré AES-256-GCM ; config ne contient JAMAIS de secret (SPEC.md §6).
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
        kind: 'github',
        config: { login: github.login, githubUserId: github.githubUserId },
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
