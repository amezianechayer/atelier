'use client';

import { type FormEvent, useState } from 'react';

export function WaitlistForm({ ctaLabel }: { ctaLabel: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setState(res.ok ? 'done' : 'error');
  }

  if (state === 'done') {
    return <p style={{ color: '#4ade80', fontWeight: 600 }}>Merci ! On te tient au courant. 🎉</p>;
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input
        type="email"
        required
        placeholder="ton@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          flex: '1 1 220px',
          padding: '12px 14px',
          borderRadius: 8,
          border: '1px solid #3f3f46',
          background: '#18181b',
          color: '#f4f4f5',
          fontSize: 16,
        }}
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        style={{
          padding: '12px 20px',
          borderRadius: 8,
          border: 'none',
          background: '#f4f4f5',
          color: '#0b0b0f',
          fontWeight: 600,
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        {state === 'sending' ? '…' : ctaLabel}
      </button>
      {state === 'error' && (
        <p role="alert" style={{ color: '#f87171', width: '100%' }}>
          Oups, réessaie dans un instant.
        </p>
      )}
    </form>
  );
}
