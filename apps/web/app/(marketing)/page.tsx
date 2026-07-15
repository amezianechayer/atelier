import { DEFAULT_LOCALE, t } from '@atelier/shared';

export default function LandingPage() {
  return (
    <main>
      <h1>{t(DEFAULT_LOCALE, 'common.appName')}</h1>
      <p>{t(DEFAULT_LOCALE, 'common.tagline')}</p>
      <p>Phase 0 — fondations. La landing du produit arrive en Phase 8 (SPEC.md §10).</p>
    </main>
  );
}
