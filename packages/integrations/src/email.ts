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

function mailpitSender(env: EmailEnv, fetchFn: typeof fetch): EmailSender {
  const from = parseFrom(env.EMAIL_FROM);
  return {
    async send(input) {
      await postJson(
        fetchFn,
        `${env.MAILPIT_URL}/api/v1/send`,
        {
          From: { Email: from.email, Name: from.name ?? '' },
          To: [{ Email: input.to }],
          Subject: input.subject,
          Text: input.text,
          ...(input.html ? { HTML: input.html } : {}),
        },
        {},
      );
    },
  };
}

function resendSender(env: EmailEnv, fetchFn: typeof fetch): EmailSender {
  return {
    async send(input) {
      await postJson(
        fetchFn,
        'https://api.resend.com/emails',
        {
          from: env.EMAIL_FROM,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          ...(input.html ? { html: input.html } : {}),
        },
        { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      );
    },
  };
}

export function createEmailSender(env: EmailEnv, fetchFn: typeof fetch = fetch): EmailSender {
  if (env.RESEND_API_KEY !== '') return resendSender(env, fetchFn);
  if (env.NODE_ENV !== 'production') return mailpitSender(env, fetchFn);
  throw new Error(
    "RESEND_API_KEY manquante : impossible d'envoyer des emails en production. Voir .env.example.",
  );
}
