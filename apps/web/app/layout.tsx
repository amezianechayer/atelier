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
      <body>{children}</body>
    </html>
  );
}
