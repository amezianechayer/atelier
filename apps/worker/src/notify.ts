import type { Db } from '@atelier/db';
import { sql } from 'drizzle-orm';

/**
 * Bus d'événements temps réel : Postgres NOTIFY, relayé en SSE par apps/web
 * (SPEC.md §3 — LISTEN/NOTIFY). Un seul canal, filtrage par ventureId côté web.
 */
export const EVENTS_CHANNEL = 'atelier_events';

/** NOTIFY est limité à ~8 Ko : on tronque les textes longs par sécurité. */
const MAX_TEXT = 4000;

export async function publish(
  db: Db,
  ventureId: string,
  event: { type: string } & Record<string, unknown>,
): Promise<void> {
  const safe = Object.fromEntries(
    Object.entries(event).map(([k, v]) =>
      typeof v === 'string' && v.length > MAX_TEXT ? [k, `${v.slice(0, MAX_TEXT)}…`] : [k, v],
    ),
  );
  const payload = JSON.stringify({ ventureId, at: new Date().toISOString(), ...safe });
  await db.execute(sql`SELECT pg_notify(${EVENTS_CHANNEL}, ${payload})`);
}

/** Regroupe les deltas de streaming pour ne pas émettre un NOTIFY par token. */
export function createDeltaBuffer(
  flush: (text: string) => Promise<void>,
  minChars = 120,
): { push(text: string): Promise<void>; end(): Promise<void> } {
  let buffer = '';
  return {
    async push(text: string) {
      buffer += text;
      if (buffer.length >= minChars) {
        const out = buffer;
        buffer = '';
        await flush(out);
      }
    },
    async end() {
      if (buffer !== '') {
        const out = buffer;
        buffer = '';
        await flush(out);
      }
    },
  };
}
