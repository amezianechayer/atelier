/**
 * Envoi d'emails produit (magic links inclus) — ADR 0004 :
 * - dev : API HTTP de Mailpit (POST /api/v1/send), zéro dépendance
 * - prod : API REST de Resend (POST /emails)
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** En-têtes additionnels (ex. List-Unsubscribe pour la prospection, SPEC.md §8.4). */
  headers?: Record<string, string>;
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<void>;
}

export interface EmailEnv {
  NODE_ENV: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  MAILPIT_URL: string;
}

/** "Atelier <a@b>" -> { name: 'Atelier', email: 'a@b' } ; "a@b" -> { email: 'a@b' } */
function parseFrom(from: string): { name?: string; email: string } {
  const match = from.match(/^(.*)<(.+)>\s*$/);
  if (match?.[2]) {
    const name = match[1]?.trim();
    return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
  }
  return { email: from.trim() };
}

async function postJson(
  fetchFn: typeof fetch,
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<void> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Envoi d'email refusé par ${new URL(url).host} (HTTP ${res.status}) : ${detail}`,
    );
  }
}

function mailpitSender(from: string, mailpitUrl: string, fetchFn: typeof fetch): EmailSender {
  const parsed = parseFrom(from);
  return {
    async send(input) {
      await postJson(
        fetchFn,
        `${mailpitUrl}/api/v1/send`,
        {
          From: { Email: parsed.email, Name: parsed.name ?? '' },
          To: [{ Email: input.to }],
          Subject: input.subject,
          Text: input.text,
          ...(input.html ? { HTML: input.html } : {}),
          ...(input.headers ? { Headers: input.headers as unknown as Record<string, string> } : {}),
        },
        {},
      );
    },
  };
}

function resendSender(from: string, token: string, fetchFn: typeof fetch): EmailSender {
  return {
    async send(input) {
      await postJson(
        fetchFn,
        'https://api.resend.com/emails',
        {
          from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          ...(input.html ? { html: input.html } : {}),
          ...(input.headers ? { headers: input.headers } : {}),
        },
        { Authorization: `Bearer ${token}` },
      );
    },
  };
}

/** Emails produit (magic links) : Resend de la plateforme, sinon Mailpit en dev. */
export function createEmailSender(env: EmailEnv, fetchFn: typeof fetch = fetch): EmailSender {
  if (env.RESEND_API_KEY !== '') return resendSender(env.EMAIL_FROM, env.RESEND_API_KEY, fetchFn);
  if (env.NODE_ENV !== 'production') return mailpitSender(env.EMAIL_FROM, env.MAILPIT_URL, fetchFn);
  throw new Error(
    "RESEND_API_KEY manquante : impossible d'envoyer des emails en production. Voir .env.example.",
  );
}

/**
 * Prospection (SPEC.md §8.4) : envoi via le Resend DE L'UTILISATEUR (token executor-side),
 * avec repli Mailpit en dev quand aucun compte Resend n'est connecté.
 */
export function createOutreachSender(
  opts: { from: string; resendToken?: string; mailpitUrl: string; devFallback: boolean },
  fetchFn: typeof fetch = fetch,
): EmailSender {
  if (opts.resendToken && opts.resendToken !== '') {
    return resendSender(opts.from, opts.resendToken, fetchFn);
  }
  if (opts.devFallback) return mailpitSender(opts.from, opts.mailpitUrl, fetchFn);
  throw new Error(
    'Aucun compte Resend connecté : connecte Resend dans Réglages pour envoyer de la prospection.',
  );
}
