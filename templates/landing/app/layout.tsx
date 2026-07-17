import type { ReactNode } from 'react';
import content from '../content.json';
import './globals.css';

export const metadata = {
  title: `${content.brandName} — ${content.tagline}`,
  description: content.subtitle,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
