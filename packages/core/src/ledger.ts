/**
 * Journal append-only chaîné SHA-256 (SPEC.md §7, §11).
 * hash = SHA256(prevHash || seq || tsISO || type || jsonCanonique(payload))
 * Premier event : prevHash = SHA256(ventureId).
 * Les événements ne se modifient JAMAIS ; correction = événement correctif (§15.8).
 */
import { createHash } from 'node:crypto';
import type { Db } from '@atelier/db';
import { ledgerEvents } from '@atelier/db';
import { asc, desc, eq, sql } from 'drizzle-orm';

export type LedgerType =
  | 'mission_state'
  | 'action_created'
  | 'action_decided'
  | 'action_executed'
  | 'message'
  | 'usage'
  | 'night_cycle'
  | 'integration';

/** JSON canonique : clés triées récursivement, sans espaces — déterministe. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export function genesisHash(ventureId: string): Buffer {
  return createHash('sha256').update(ventureId).digest();
}

function computeHash(
  prevHash: Buffer,
  seq: number,
  tsISO: string,
  type: string,
  payloadJson: string,
): Buffer {
  return createHash('sha256')
    .update(prevHash)
    .update(String(seq))
    .update(tsISO)
    .update(type)
    .update(payloadJson)
    .digest();
}

export async function appendEvent(
  db: Db,
  ventureId: string,
  type: LedgerType,
  payload: unknown,
): Promise<{ seq: number; hash: Buffer }> {
  return db.transaction(async (tx) => {
    // Sérialise les écritures par venture (seq strictement croissant sans trou).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ventureId}))`);

    const [last] = await tx
      .select({ seq: ledgerEvents.seq, hash: ledgerEvents.hash })
      .from(ledgerEvents)
      .where(eq(ledgerEvents.ventureId, ventureId))
      .orderBy(desc(ledgerEvents.seq))
      .limit(1);

    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? genesisHash(ventureId);
    const ts = new Date();
    const payloadJson = canonicalJson(payload ?? {});
    const hash = computeHash(prevHash, seq, ts.toISOString(), type, payloadJson);

    await tx.insert(ledgerEvents).values({
      ventureId,
      seq,
      ts,
      type,
      payload: JSON.parse(payloadJson) as Record<string, unknown>,
      prevHash,
      hash,
    });
    return { seq, hash };
  });
}

export async function verifyChain(
  db: Db,
  ventureId: string,
): Promise<{ ok: true } | { ok: false; brokenAtSeq: number }> {
  const rows = await db
    .select()
    .from(ledgerEvents)
    .where(eq(ledgerEvents.ventureId, ventureId))
    .orderBy(asc(ledgerEvents.seq));

  let prev = genesisHash(ventureId);
  let expectedSeq = 1;
  for (const row of rows) {
    if (row.seq !== expectedSeq) {
      // Trou ou duplication : la rupture est au seq attendu.
      return { ok: false, brokenAtSeq: Math.min(row.seq, expectedSeq) };
    }
    if (!row.prevHash || !Buffer.from(row.prevHash).equals(prev)) {
      return { ok: false, brokenAtSeq: row.seq };
    }
    const recomputed = computeHash(
      prev,
      row.seq,
      row.ts.toISOString(),
      row.type,
      canonicalJson(row.payload),
    );
    if (!row.hash || !Buffer.from(row.hash).equals(recomputed)) {
      return { ok: false, brokenAtSeq: row.seq };
    }
    prev = Buffer.from(row.hash);
    expectedSeq++;
  }
  return { ok: true };
}

/** Export JSONL complet de la chaîne (vérifiable hors plateforme). */
export async function exportChain(db: Db, ventureId: string): Promise<ReadableStream<Uint8Array>> {
  const rows = await db
    .select()
    .from(ledgerEvents)
    .where(eq(ledgerEvents.ventureId, ventureId))
    .orderBy(asc(ledgerEvents.seq));

  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= rows.length) {
        controller.close();
        return;
      }
      const row = rows[index++];
      if (!row) return;
      const line = JSON.stringify({
        seq: row.seq,
        ts: row.ts.toISOString(),
        type: row.type,
        payload: row.payload,
        prevHash: row.prevHash ? Buffer.from(row.prevHash).toString('hex') : null,
        hash: row.hash ? Buffer.from(row.hash).toString('hex') : null,
      });
      controller.enqueue(encoder.encode(`${line}\n`));
    },
  });
}
