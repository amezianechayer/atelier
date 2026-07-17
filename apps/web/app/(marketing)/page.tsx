import { DEFAULT_LOCALE, t } from '@atelier/shared';
import Link from 'next/link';

const L = DEFAULT_LOCALE;

export default function LandingPage() {
  return (
    <main className="page" style={{ paddingTop: '14vh', textAlign: 'center' }}>
      <p className="eyebrow" style={{ justifyContent: 'center' }}>
        {t(L, 'common.appName')}
      </p>
      <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)' }}>
        Ton <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>équipe d'agents IA</em>, au
        travail pendant que tu dors.
      </h1>
      <p className="muted" style={{ fontSize: '1.15rem', maxWidth: '32ch', margin: '0 auto 2rem' }}>
        {t(L, 'common.tagline')}
      </p>
      <Link href="/login" className="btn btn-accent">
        Commencer →
      </Link>

      <ul
        className="stack"
        style={{ listStyle: 'none', padding: 0, marginTop: '3.5rem', textAlign: 'left' }}
      >
        {[
          [
            '🧭',
            'Un CEO virtuel',
            'Décris ton idée : il produit ton plan, ton backlog et ta mémoire de marque en quelques minutes.',
          ],
          [
            '🛠️',
            'Un Builder qui livre',
            'Ta landing page construite et déployée sur TON GitHub et TON Vercel — pas les nôtres.',
          ],
          [
            '🛡️',
            'Rien sans ton accord',
            'Chaque action irréversible passe par ta file d’approbation. Budget IA plafonné, coupure nette.',
          ],
        ].map(([icon, title, body]) => (
          <li key={title} className="card">
            <strong style={{ fontSize: '1.05rem' }}>
              {icon} {title}
            </strong>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {body}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
