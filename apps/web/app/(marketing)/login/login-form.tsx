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
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      {googleEnabled ? (
        <button type="button" onClick={signInWithGoogle} style={buttonStyle}>
          {t(L, 'login.googleCta')}
        </button>
      ) : (
        <p style={{ color: '#666', fontSize: 14 }}>{t(L, 'login.googleUnavailable')}</p>
      )}

      <p style={{ textAlign: 'center', color: '#999', margin: 0 }}>{t(L, 'login.or')}</p>

      {state === 'sent' ? (
        <p role="status">{t(L, 'login.linkSent')}</p>
      ) : (
        <form onSubmit={sendMagicLink} style={{ display: 'grid', gap: 8 }}>
          <label htmlFor="email">{t(L, 'login.emailLabel')}</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
          />
          <button type="submit" disabled={state === 'sending'} style={buttonStyle}>
            {state === 'sending' ? t(L, 'login.sending') : t(L, 'login.sendLink')}
          </button>
          {state === 'error' && (
            <p role="alert" style={{ color: '#b00020' }}>
              {t(L, 'login.error')}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 6,
  border: '1px solid #333',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
};
