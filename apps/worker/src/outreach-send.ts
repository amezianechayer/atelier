import {
  enforcePlanQuota,
  filterSendable,
  makeUnsubscribeToken,
  normalizeEmail,
  type OutreachContact,
} from '@atelier/core';
import { outreachContacts, suppressionList, users, ventures } from '@atelier/db';
import { createOutreachSender, type SendEmailInput } from '@atelier/integrations';
import { PLANS, type PlanId } from '@atelier/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import { loadIntegrationToken } from './integrations-token';
import type { Runtime } from './runtime';

/**
 * Envoi de prospection conforme par construction (SPEC.md §8.4, §11) : filtrage
 * suppression list (jamais contournable) + quota du plan + lien/entête unsubscribe,
 * appliqués EN CODE. Le token Resend de l'utilisateur reste côté serveur.
 */

export interface EmailBatchPayload {
  subject: string;
  body: string; // {{firstName}} remplacé par contact
  recipients: Array<{
    email: string;
    firstName?: string | null;
    company?: string | null;
    source: string;
  }>;
}

export interface SendResult {
  sent: number;
  removed: Array<{ email: string; reason: string }>;
  quotaTruncated: number;
  failed: number;
  via: 'resend' | 'mailpit';
}

function renderBody(
  body: string,
  contact: { firstName?: string | null },
  unsubUrl: string,
): string {
  const withName = body.replace(/\{\{\s*firstName\s*\}\}/g, contact.firstName?.trim() || 'bonjour');
  return `${withName}\n\n—\nPour ne plus recevoir ces emails : ${unsubUrl}`;
}

export async function sendEmailBatch(
  rt: Runtime,
  ventureId: string,
  payload: EmailBatchPayload,
): Promise<SendResult> {
  const { db, env } = rt;
  if (env.SECRETS_MASTER_KEY === '') {
    throw new Error('SECRETS_MASTER_KEY absente : impossible de signer les liens unsubscribe.');
  }

  // 1. Plan de l'utilisateur (quota mensuel d'emails, SPEC.md §12).
  const [row] = await db
    .select({ userId: ventures.userId, plan: users.plan })
    .from(ventures)
    .innerJoin(users, eq(users.id, ventures.userId))
    .where(eq(ventures.id, ventureId));
  if (!row) throw new Error(`venture ${ventureId} introuvable`);
  const monthlyQuota = PLANS[row.plan as PlanId].emailsPerMonth;

  // 2. Suppression list GLOBALE (barrière absolue).
  const suppressed = await db.select({ email: suppressionList.email }).from(suppressionList);

  const contacts: OutreachContact[] = payload.recipients.map((r) => ({
    email: r.email,
    status: 'new',
    source: r.source,
    firstName: r.firstName ?? null,
    company: r.company ?? null,
  }));
  const { sendable, removed } = filterSendable({
    contacts,
    suppressionList: suppressed.map((s) => s.email),
    skipContacted: true,
  });

  // 3. Quota du plan : combien peuvent réellement partir ce mois-ci.
  const [sentAgg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outreachContacts)
    .where(
      and(
        eq(outreachContacts.ventureId, ventureId),
        gte(outreachContacts.contactedAt, sql`date_trunc('month', now())`),
      ),
    );
  const quota = enforcePlanQuota({
    monthlyQuota,
    sentThisMonth: Number(sentAgg?.n ?? 0),
    requested: sendable.length,
  });
  const toSend = sendable.slice(0, quota.allowed);
  const quotaTruncated = sendable.length - toSend.length;

  // 4. Sender : Resend de l'utilisateur si connecté, sinon Mailpit en dev.
  let resendToken: string | undefined;
  try {
    resendToken = (await loadIntegrationToken(rt, ventureId, 'resend')).token;
  } catch {
    resendToken = undefined;
  }
  const sender = createOutreachSender({
    from: env.EMAIL_FROM,
    resendToken,
    mailpitUrl: env.MAILPIT_URL,
    devFallback: env.NODE_ENV !== 'production',
  });
  const via = resendToken ? 'resend' : 'mailpit';

  // 5. Envoi + marquage. Le lien + l'entête List-Unsubscribe sont injectés en code.
  const base = env.BETTER_AUTH_URL.replace(/\/$/, '');
  let sent = 0;
  let failed = 0;
  for (const c of toSend) {
    const token = makeUnsubscribeToken(env.SECRETS_MASTER_KEY, ventureId, c.email);
    const unsubUrl = `${base}/unsubscribe?token=${token}`;
    const email: SendEmailInput = {
      to: c.email,
      subject: payload.subject,
      text: renderBody(payload.body, c, unsubUrl),
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
    try {
      await sender.send(email);
      await db
        .insert(outreachContacts)
        .values({
          ventureId,
          email: normalizeEmail(c.email),
          firstName: c.firstName ?? null,
          company: c.company ?? null,
          source: c.source,
          status: 'contacted',
          contactedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [outreachContacts.ventureId, outreachContacts.email],
          set: { status: 'contacted', contactedAt: new Date() },
        });
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, removed, quotaTruncated, failed, via };
}
