import { z } from 'zod';

const DEV_DATABASE_URL = 'postgres://atelier:atelier@localhost:5432/atelier';

function isBase64Key32(value: string): boolean {
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length === 32 && buf.toString('base64') === value;
  } catch {
    return false;
  }
}

const postgresUrl = z
  .string()
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    message: 'doit être une URL postgres:// ou postgresql://',
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: postgresUrl.default(DEV_DATABASE_URL),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('atelier'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),

  BETTER_AUTH_SECRET: z.string().default(''),
  BETTER_AUTH_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),
  // Expéditeur des emails produit (magic links inclus).
  EMAIL_FROM: z.string().default('Atelier <atelier@localhost>'),
  // API HTTP de Mailpit, utilisée pour l'envoi d'emails en dev (ADR 0004).
  MAILPIT_URL: z.string().default('http://localhost:8025'),

  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),

  // Vides en dev : le dev server Inngest ne signe pas.
  INNGEST_EVENT_KEY: z.string().default(''),
  INNGEST_SIGNING_KEY: z.string().default(''),

  TELEGRAM_BOT_TOKEN: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  SECRETS_MASTER_KEY: z
    .string()
    .default('')
    .refine((v) => v === '' || isBase64Key32(v), {
      message:
        "32 octets encodés base64 attendus — générer avec : node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    }),

  SANDBOX_IMAGE: z.string().default('atelier/sandbox:dev'),

  DEFAULT_NIGHT_LIMIT_USD: z.coerce.number().positive().default(1.0),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

/** Clés qui ne peuvent PAS retomber sur un défaut de dev en production. */
const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'SECRETS_MASTER_KEY',
  'BETTER_AUTH_SECRET',
] as const;

/**
 * Charge et valide l'environnement. Crash immédiat avec message actionnable si invalide
 * (règle 7 de SPEC.md §15). En dev, les valeurs de docker/compose.dev.yml servent de défauts.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  if (source.NODE_ENV === 'production') {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !source[key]);
    if (missing.length > 0) {
      throw new Error(
        `Configuration invalide : ${missing.join(', ')} obligatoire(s) en production (pas de défaut de dev). Voir .env.example.`,
      );
    }
  }

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuration invalide (.env) :\n${details}\nCorrige ces variables puis relance. Voir .env.example.`,
    );
  }
  return parsed.data;
}
