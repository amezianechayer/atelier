import { DEFAULT_LOCALE, t } from '@atelier/shared';

export default function LandingPage() {
  return (
    <main>
      <h1>{t(DEFAULT_LOCALE, 'common.appName')}</h1>
      <p>{t(DEFAULT_LOCALE, 'common.tagline')}</p>
      <p>
        <a href="/login">{t(DEFAULT_LOCALE, 'login.sendLink')}</a>
      </p>
    </main>
  );
}
