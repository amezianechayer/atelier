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
    <main style={{ maxWidth: 480, margin: '10vh auto', padding: 24 }}>
      <h1>{t(DEFAULT_LOCALE, 'login.title')}</h1>
      <p>{t(DEFAULT_LOCALE, 'login.subtitle')}</p>
      <LoginForm googleEnabled={googleEnabled} />
    </main>
  );
}
