import { integrations } from '@atelier/db';
import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { SettingsForms } from './settings-forms';

const L = DEFAULT_LOCALE;

/** Réglages (SPEC.md §10.7) : intégrations — les assets appartiennent à l'utilisateur. */
export default async function SettingsPage() {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');

  const rows = await getDb()
    .select({ kind: integrations.kind, config: integrations.config })
    .from(integrations)
    .where(eq(integrations.userId, found.user.id))
    .orderBy(desc(integrations.createdAt));
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!latest.has(row.kind)) latest.set(row.kind, row.config as Record<string, unknown>);
  }

  return (
    <main className="page">
      <p className="crumb">
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
      </p>
      <p className="eyebrow">Atelier</p>
      <h1>⚙️ {t(L, 'settings.title')}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {t(L, 'settings.subtitle')}
      </p>

      <h2>{t(L, 'settings.integrations')}</h2>
      <SettingsForms
        github={latest.has('github') ? (latest.get('github') ?? {}) : null}
        vercel={latest.has('vercel') ? (latest.get('vercel') ?? {}) : null}
        telegram={latest.has('telegram') ? (latest.get('telegram') ?? {}) : null}
      />
    </main>
  );
}
