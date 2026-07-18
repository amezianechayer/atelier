import { ventures } from '@atelier/db';
import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { CreateVentureForm } from './create-venture-form';
import { SignOutButton } from './sign-out-button';

const L = DEFAULT_LOCALE;

const STATUS_TAG: Record<string, string> = {
  onboarding: 'tag-info',
  active: 'tag-ok',
  paused: 'tag-warn',
  archived: 'tag',
};

export default async function VenturesPage() {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');

  const rows = await getDb()
    .select()
    .from(ventures)
    .where(eq(ventures.userId, found.user.id))
    .orderBy(desc(ventures.createdAt));

  return (
    <>
      <header className="appbar">
        <Link href="/app" className="brand">
          Atelier<span className="spark">.</span>
        </Link>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/settings" className="btn btn-ghost btn-sm">
            ⚙️ {t(L, 'app.openSettings')}
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="page">
        <p className="eyebrow">Ton atelier</p>
        <h1>{t(L, 'app.title')}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {t(L, 'common.tagline')}
        </p>

        {rows.length === 0 ? (
          <div className="card" style={{ marginTop: 24, textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              {t(L, 'app.empty')}
            </p>
          </div>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
            {rows.map((v) => (
              <li key={v.id} className="card reveal">
                <div className="between">
                  <Link
                    href={`/ventures/${v.id}`}
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: '1.35rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {v.name}
                  </Link>
                  <span className={`tag ${STATUS_TAG[v.status] ?? 'tag'}`}>{v.status}</span>
                </div>
                <p className="muted" style={{ margin: '8px 0 14px' }}>
                  {v.pitch}
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn btn-sm" href={`/ventures/${v.id}`}>
                    ▶ {t(L, 'app.openCockpit')}
                  </Link>
                  <Link className="btn btn-ghost btn-sm" href={`/ventures/${v.id}/onboarding`}>
                    ✨ {t(L, 'app.openOnboarding')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2>Nouvelle venture</h2>
        <div className="card">
          <CreateVentureForm />
        </div>
      </main>
    </>
  );
}
