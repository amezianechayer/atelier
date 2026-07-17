import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/app');

  const env = getEnv();
  const googleEnabled = env.GOOGLE_CLIENT_ID !== '' && env.GOOGLE_CLIENT_SECRET !== '';

  return (
    <main className="page page-narrow" style={{ paddingTop: '12vh' }}>
      <p className="eyebrow">Atelier</p>
      <h1>{t(DEFAULT_LOCALE, 'login.title')}</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 28 }}>
        {t(DEFAULT_LOCALE, 'login.subtitle')}
      </p>
      <div className="card">
        <LoginForm googleEnabled={googleEnabled} />
      </div>
    </main>
  );
}
