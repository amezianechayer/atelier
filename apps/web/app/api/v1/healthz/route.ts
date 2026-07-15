import type { HealthzResponse } from '@atelier/shared';

export function GET(): Response {
  const body: HealthzResponse = { ok: true, service: 'web' };
  return Response.json(body);
}
