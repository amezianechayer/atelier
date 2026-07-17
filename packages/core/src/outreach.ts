/**
 * Prospection conforme par construction (SPEC.md §2.10, §8.4, §11) — pur TS.
 * - suppression list GLOBALE non contournable (filtrée en code, jamais par le modèle)
 * - source des contacts obligatoire (refus des imports non sourcés)
 * - quotas par plan appliqués en code
 * - token unsubscribe HMAC : stateless, infalsifiable, alimente la suppression list
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type ContactStatus = 'new' | 'contacted' | 'replied' | 'unsubscribed' | 'bounced';

export interface OutreachContact {
  email: string;
  status: ContactStatus;
  /** Provenance obligatoire (SPEC.md §11) : un contact sans source n'est jamais envoyable. */
  source: string;
  firstName?: string | null;
  company?: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface FilterSendableInput {
  contacts: OutreachContact[];
  /** Emails de la suppression list globale (comparés normalisés). */
  suppressionList: readonly string[];
  /** Retire aussi les contacts déjà « contacted ». */
  skipContacted?: boolean;
}

export interface FilterSendableResult {
  sendable: OutreachContact[];
  removed: Array<{ email: string; reason: string }>;
}

/**
 * Seul point d'entrée produisant la liste d'envoi. Tout ce qui n'en sort pas ne peut
 * PAS être envoyé. La suppression list prime sur tout le reste.
 */
export function filterSendable(input: FilterSendableInput): FilterSendableResult {
  const suppressed = new Set(input.suppressionList.map(normalizeEmail));
  const seen = new Set<string>();
  const sendable: OutreachContact[] = [];
  const removed: Array<{ email: string; reason: string }> = [];

  for (const c of input.contacts) {
    const norm = normalizeEmail(c.email);

    // 1. Suppression list : barrière absolue, avant tout autre critère.
    if (suppressed.has(norm)) {
      removed.push({ email: c.email, reason: 'suppression_list' });
      continue;
    }
    // 2. Source obligatoire.
    if (!c.source || c.source.trim() === '') {
      removed.push({ email: c.email, reason: 'source_manquante' });
      continue;
    }
    // 3. Statuts non contactables.
    if (c.status === 'unsubscribed' || c.status === 'bounced' || c.status === 'replied') {
      removed.push({ email: c.email, reason: c.status });
      continue;
    }
    if (input.skipContacted && c.status === 'contacted') {
      removed.push({ email: c.email, reason: 'deja_contacte' });
      continue;
    }
    // 4. Dédoublonnage.
    if (seen.has(norm)) {
      removed.push({ email: c.email, reason: 'doublon' });
      continue;
    }
    seen.add(norm);
    sendable.push(c);
  }
  return { sendable, removed };
}

export interface QuotaInput {
  monthlyQuota: number;
  sentThisMonth: number;
  requested: number;
}

export interface QuotaResult {
  allowed: number;
  remaining: number;
  exceeded: boolean;
}

export function enforcePlanQuota(input: QuotaInput): QuotaResult {
  const remaining = Math.max(0, input.monthlyQuota - input.sentThisMonth);
  const allowed = Math.min(input.requested, remaining);
  return { allowed, remaining, exceeded: input.requested > remaining };
}

// --- Token unsubscribe : payload.base64url + signature HMAC.base64url ---

function sign(secret: string, payload: string): Buffer {
  return createHmac('sha256', Buffer.from(secret, 'base64')).update(payload).digest();
}

export function makeUnsubscribeToken(secret: string, ventureId: string, email: string): string {
  const payload = `${ventureId}:${normalizeEmail(email)}`;
  const p = Buffer.from(payload).toString('base64url');
  const s = sign(secret, payload).toString('base64url');
  return `${p}.${s}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { ventureId: string; email: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [p, s] = parts;
  if (!p || !s) return null;
  let payload: string;
  try {
    payload = Buffer.from(p, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(secret, payload);
  let provided: Buffer;
  try {
    provided = Buffer.from(s, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  const sep = payload.indexOf(':');
  if (sep <= 0) return null;
  const ventureId = payload.slice(0, sep);
  const email = payload.slice(sep + 1);
  if (!ventureId || !email) return null;
  return { ventureId, email };
}
