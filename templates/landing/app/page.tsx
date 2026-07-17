import content from '../content.json';
import { WaitlistForm } from './waitlist-form';

export default function Home() {
  return (
    <main className="wrap">
      <p className="eyebrow reveal">{content.brandName}</p>

      {/* Le premier mot du titre est mis en exergue (italique + accent) pour du caractère. */}
      <h1 className="reveal">{renderHeadline(content.tagline)}</h1>

      <p className="subtitle reveal">{content.subtitle}</p>

      <div className="reveal">
        <WaitlistForm ctaLabel={content.ctaLabel} />
      </div>

      <ul className="bullets reveal">
        {content.bullets.map((b) => (
          <li key={b}>
            <span className="check" aria-hidden>
              ✓
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <footer className="reveal">
        <span>{content.brandName}</span>
        <span className="dot" aria-hidden />
        <span>{content.footerNote}</span>
      </footer>
    </main>
  );
}

/** Met en exergue le premier segment fort du titre sans dépendre du contenu exact. */
function renderHeadline(tagline: string) {
  const words = tagline.split(' ');
  if (words.length < 4) return tagline;
  const cut = Math.min(2, words.length - 1);
  return (
    <>
      <em>{words.slice(0, cut).join(' ')}</em> {words.slice(cut).join(' ')}
    </>
  );
}
