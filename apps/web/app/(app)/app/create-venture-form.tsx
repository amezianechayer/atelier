'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const L = DEFAULT_LOCALE;

export function CreateVentureForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pitch, setPitch] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('saving');
    const res = await fetch('/api/v1/ventures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pitch }),
    });
    if (res.ok) {
      const body = (await res.json()) as { venture: { id: string } };
      setName('');
      setPitch('');
      setState('idle');
      // L'écran qui vend le produit : direction l'onboarding en direct (SPEC.md §10).
      router.push(`/ventures/${body.venture.id}/onboarding`);
    } else {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; hint?: string };
      } | null;
      setErrorMessage(body?.error?.message ?? t(L, 'app.form.error'));
      setState('error');
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, marginTop: 32, maxWidth: 480 }}>
      <label htmlFor="name">{t(L, 'app.form.name')}</label>
      <input
        id="name"
        required
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
      />
      <label htmlFor="pitch">{t(L, 'app.form.pitch')}</label>
      <textarea
        id="pitch"
        required
        maxLength={2000}
        rows={4}
        value={pitch}
        onChange={(e) => setPitch(e.target.value)}
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={state === 'saving'}
        style={{
          padding: '10px 16px',
          borderRadius: 6,
          border: '1px solid #333',
          background: '#111',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {state === 'saving' ? t(L, 'common.loading') : t(L, 'app.form.submit')}
      </button>
      {state === 'error' && (
        <p role="alert" style={{ color: '#b00020' }}>
          {errorMessage}
        </p>
      )}
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid #ccc',
  borderRadius: 6,
  fontFamily: 'inherit',
};
