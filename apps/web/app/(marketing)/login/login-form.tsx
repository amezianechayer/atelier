'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/lib/auth-client';

const L = DEFAULT_LOCALE;

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: '/app' });
    setState(error ? 'error' : 'sent');
  }

  async function signInWithGoogle() {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/app' });
  }

  return (
    <div className="stack">
      {googleEnabled ? (
        <button type="button" className="btn btn-ghost" onClick={signInWithGoogle}>
          {t(L, 'login.googleCta')}
        </button>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          {t(L, 'login.googleUnavailable')}
        </p>
      )}

      <p className="muted" style={{ textAlign: 'center', margin: 0, fontSize: '0.85rem' }}>
        {t(L, 'login.or')}
      </p>

      {state === 'sent' ? (
        <p
          className="tag tag-ok"
          role="status"
          style={{ padding: '10px 14px', fontSize: '0.9rem' }}
        >
          {t(L, 'login.linkSent')}
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="stack" style={{ gap: 10 }}>
          <div>
            <label htmlFor="email">{t(L, 'login.emailLabel')}</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-accent" disabled={state === 'sending'}>
            {state === 'sending' ? t(L, 'login.sending') : `✉️ ${t(L, 'login.sendLink')}`}
          </button>
          {state === 'error' && (
            <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
              {t(L, 'login.error')}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
