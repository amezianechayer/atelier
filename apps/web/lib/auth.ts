import { accounts, sessions, users, verifications } from '@atelier/db';
import { createEmailSender } from '@atelier/integrations';
import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { getEnv } from './env';

const env = getEnv();
const db = getDb();
const emailSender = createEmailSender(env);

if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET === '') {
  // Défense en profondeur : loadEnv l'impose déjà en production.
  throw new Error('BETTER_AUTH_SECRET obligatoire en production. Voir .env.example.');
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET !== '' ? env.BETTER_AUTH_SECRET : 'atelier-dev-secret-non-prod',
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  // usePlural mappe déjà user -> users ; ne PAS ajouter modelName (double pluriel).
  user: {
    fields: { name: 'displayName' },
  },
  // Google seulement si les identifiants OAuth sont fournis (SPEC.md §2.1).
  socialProviders:
    env.GOOGLE_CLIENT_ID !== '' && env.GOOGLE_CLIENT_SECRET !== ''
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  databaseHooks: {
    account: {
      create: {
        // Renseigne users.google_sub (colonne contractuelle de SPEC.md §6).
        after: async (account) => {
          if (account.providerId === 'google') {
            await db
              .update(users)
              .set({ googleSub: account.accountId })
              .where(eq(users.id, account.userId));
          }
        },
      },
    },
  },
  advanced: {
    database: {
      // Ids UUID générés par Postgres (defaultRandom), cohérents avec tout le schéma.
      generateId: false,
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const locale = DEFAULT_LOCALE;
        await emailSender.send({
          to: email,
          subject: t(locale, 'email.magicLink.subject'),
          text: `${t(locale, 'email.magicLink.intro')}\n\n${url}\n\n${t(locale, 'email.magicLink.expiry')}`,
          html: `<p>${t(locale, 'email.magicLink.intro')}</p><p><a href="${url}">${t(locale, 'email.magicLink.cta')}</a></p><p>${t(locale, 'email.magicLink.expiry')}</p>`,
        });
      },
    }),
    // Doit rester le dernier plugin (doc Better Auth).
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/** Le user de session avec nos colonnes métier (plan notamment). */
export async function getSessionUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  return user ? { session, user } : null;
}
