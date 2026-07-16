import content from '../content.json';
import { WaitlistForm } from './waitlist-form';

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '12vh 24px',
        display: 'grid',
        gap: 28,
      }}
    >
      <p style={{ letterSpacing: 2, textTransform: 'uppercase', color: '#a1a1aa', margin: 0 }}>
        {content.brandName}
      </p>
      <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', lineHeight: 1.05, margin: 0 }}>
        {content.tagline}
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#d4d4d8', margin: 0 }}>{content.subtitle}</p>

      <ul style={{ display: 'grid', gap: 10, padding: 0, listStyle: 'none', margin: 0 }}>
        {content.bullets.map((b) => (
          <li key={b} style={{ display: 'flex', gap: 10 }}>
            <span aria-hidden>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <WaitlistForm ctaLabel={content.ctaLabel} />

      <footer style={{ color: '#71717a', fontSize: 13, marginTop: 24 }}>
        {content.footerNote} · {content.brandName}
      </footer>
    </main>
  );
}
