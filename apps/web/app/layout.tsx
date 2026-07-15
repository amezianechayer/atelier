import { DEFAULT_LOCALE, t } from '@atelier/shared';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: t(DEFAULT_LOCALE, 'common.appName'),
  description: t(DEFAULT_LOCALE, 'common.tagline'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE}>
      {/* Thème clair forcé en v1 ; thématisation complète en Phase 8. */}
      <body
        style={{
          background: '#fff',
          color: '#111',
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
