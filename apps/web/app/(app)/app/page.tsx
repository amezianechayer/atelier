import { ventures } from '@atelier/db';
import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { CreateVentureForm } from './create-venture-form';
import { SignOutButton } from './sign-out-button';

const L = DEFAULT_LOCALE;

export default async function VenturesPage() {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');

  const rows = await getDb()
    .select()
    .from(ventures)
    .where(eq(ventures.userId, found.user.id))
    .orderBy(desc(ventures.createdAt));

  return (
    <main style={{ maxWidth: 640, margin: '5vh auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t(L, 'app.title')}</h1>
        <SignOutButton />
      </header>

      {rows.length === 0 ? (
        <p>{t(L, 'app.empty')}</p>
      ) : (
        <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none' }}>
          {rows.map((v) => (
            <li key={v.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <strong>{v.name}</strong>
              <span style={{ marginLeft: 8, color: '#666', fontSize: 13 }}>{v.status}</span>
              <p style={{ margin: '8px 0 0', color: '#444' }}>{v.pitch}</p>
              <p style={{ margin: '10px 0 0', display: 'flex', gap: 16 }}>
                <a href={`/ventures/${v.id}/chat`}>🧭 {t(L, 'app.openChat')}</a>
                <a href={`/ventures/${v.id}/onboarding`}>✨ {t(L, 'app.openOnboarding')}</a>
              </p>
            </li>
          ))}
        </ul>
      )}

      <CreateVentureForm />
    </main>
  );
}
