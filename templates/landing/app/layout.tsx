import type { ReactNode } from 'react';
import content from '../content.json';

export const metadata = {
  title: content.brandName,
  description: content.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#0b0b0f',
          color: '#f4f4f5',
        }}
      >
        {children}
      </body>
    </html>
  );
}
