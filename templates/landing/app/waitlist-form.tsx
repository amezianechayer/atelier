'use client';

import { type FormEvent, useState } from 'react';

export function WaitlistForm({ ctaLabel }: { ctaLabel: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <p className="form-msg ok" role="status">
        Merci ! Tu es sur la liste — on te tient au courant. 🎉
      </p>
    );
  }

  return (
    <>
      <form className="waitlist" onSubmit={submit}>
        <input
          type="email"
          required
          placeholder="ton@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Ton adresse email"
        />
        <button type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'Un instant…' : ctaLabel}
        </button>
      </form>
      {state === 'error' && (
        <p className="form-msg err" role="alert">
          Oups, réessaie dans un instant.
        </p>
      )}
    </>
  );
}
