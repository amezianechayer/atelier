import { randomBytes } from 'node:crypto';
import { verifications } from '@atelier/db';
import { requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';

/**
 * Liaison Telegram par code unique (SPEC.md §16 Phase 6) : le code (15 min) est
 * remis au bot via /start CODE ; le worker le consomme et lie le chatId au compte.
 */

/** Alphabet sans ambiguïtés (pas de 0/O ni 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return code;
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const code = makeCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await getDb()
    .insert(verifications)
    .values({ identifier: `tg-link:${code}`, value: user.id, expiresAt });

  return Response.json({ code, command: `/start ${code}`, expiresAt: expiresAt.toISOString() });
}
