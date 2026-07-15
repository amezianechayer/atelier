import type { users } from '@atelier/db';
import type { ApiError } from '@atelier/shared';
import type { z } from 'zod';
import { getSessionUser } from './auth';

/** Erreur contractuelle { error: { code, message, hint } } (SPEC.md §9). */
export function apiError(status: number, code: string, message: string, hint?: string): Response {
  const body: ApiError = { error: { code, message, ...(hint ? { hint } : {}) } };
  return Response.json(body, { status });
}

export type SessionUser = typeof users.$inferSelect;

/**
 * Scoping strict par session (SPEC.md §9) : aucun id utilisateur accepté du client.
 * Retourne l'utilisateur de session, ou une Response 401 prête à renvoyer.
 */
export async function requireUser(request: Request): Promise<SessionUser | Response> {
  const found = await getSessionUser(new Headers(request.headers));
  if (!found) {
    return apiError(401, 'unauthenticated', 'Connecte-toi pour continuer.', 'GET /login');
  }
  return found.user;
}

/** Parse le corps JSON avec un schéma zod ; renvoie une 400 actionnable sinon. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, 'invalid_json', 'Le corps de la requête doit être du JSON valide.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') || 'corps';
    return apiError(
      400,
      'validation_error',
      `Champ « ${where} » : ${first?.message ?? 'invalide'}.`,
      'Corrige ce champ puis renvoie la requête.',
    );
  }
  return parsed.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un id non-UUID ne peut correspondre à aucune ressource : 404 uniforme (pas de fuite). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function notFound(): Response {
  return apiError(404, 'not_found', 'Cette ressource n’existe pas ou ne t’appartient pas.');
}
