'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';

const L = DEFAULT_LOCALE;

interface ChatMessage {
  id: string;
  role: 'user' | 'ceo' | 'system';
  content: string;
}

type StreamEvent = {
  type: string;
  conversationId?: string;
  text?: string;
  costUsd?: number;
};

export function ChatLive(props: {
  ventureId: string;
  ventureName: string;
  initialMessages: ChatMessage[];
}) {
  const [history, setHistory] = useState<ChatMessage[]>(props.initialMessages);
  const [pending, setPending] = useState(''); // réponse CEO en cours de streaming
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/v1/ventures/${props.ventureId}/stream`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as StreamEvent;
      if (event.type === 'chat.delta' && event.text) {
        setPending((p) => p + event.text);
      } else if (event.type === 'chat.done') {
        setPending((finalText) => {
          if (finalText !== '') {
            setHistory((h) => [...h, { id: `ceo-${Date.now()}`, role: 'ceo', content: finalText }]);
          }
          return '';
        });
        setThinking(false);
      }
    };
    return () => source.close();
  }, [props.ventureId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (content === '' || thinking) return;
    setError('');
    setInput('');
    setHistory((h) => [...h, { id: `user-${Date.now()}`, role: 'user', content }]);
    setThinking(true);
    const res = await fetch(`/api/v1/chat/${props.ventureId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? t(L, 'error.generic'));
      setThinking(false);
    }
  }

  return (
    <main className="page">
      <p className="crumb">
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
      </p>
      <p className="eyebrow">{props.ventureName}</p>
      <h1>🧭 {t(L, 'chat.title')}</h1>

      <div
        className="card"
        style={{
          minHeight: 340,
          maxHeight: '58vh',
          overflowY: 'auto',
          display: 'grid',
          gap: 10,
          alignContent: 'start',
          marginTop: 16,
        }}
      >
        {history.length === 0 && pending === '' && <p className="muted">{t(L, 'chat.empty')}</p>}
        {history.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-ceo'}`}>
            {m.content}
          </div>
        ))}
        {pending !== '' && <div className="bubble bubble-ceo">{pending}▌</div>}
        {thinking && pending === '' && <p className="muted">{t(L, 'chat.thinking')}</p>}
        <div ref={bottomRef} />
      </div>

      {error !== '' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <form onSubmit={send} className="row" style={{ marginTop: 12, flexWrap: 'nowrap' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t(L, 'chat.placeholder')}
        />
        <button type="submit" className="btn btn-accent" disabled={thinking}>
          {t(L, 'chat.send')}
        </button>
      </form>
    </main>
  );
}
