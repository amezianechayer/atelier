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
    <main style={{ maxWidth: 720, margin: '3vh auto', padding: 24 }}>
      <p>
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
      </p>
      <h1>
        🧭 {props.ventureName} — {t(L, 'chat.title')}
      </h1>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 16,
          minHeight: 320,
          maxHeight: '55vh',
          overflowY: 'auto',
          display: 'grid',
          gap: 10,
          alignContent: 'start',
        }}
      >
        {history.length === 0 && pending === '' && (
          <p style={{ color: '#777' }}>{t(L, 'chat.empty')}</p>
        )}
        {history.map((m) => (
          <div
            key={m.id}
            style={{
              justifySelf: m.role === 'user' ? 'end' : 'start',
              background: m.role === 'user' ? '#111' : '#f4f4f4',
              color: m.role === 'user' ? '#fff' : '#111',
              borderRadius: 10,
              padding: '8px 12px',
              maxWidth: '85%',
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.content}
          </div>
        ))}
        {pending !== '' && (
          <div
            style={{
              justifySelf: 'start',
              background: '#f4f4f4',
              borderRadius: 10,
              padding: '8px 12px',
              maxWidth: '85%',
              whiteSpace: 'pre-wrap',
            }}
          >
            {pending}▌
          </div>
        )}
        {thinking && pending === '' && <p style={{ color: '#777' }}>{t(L, 'chat.thinking')}</p>}
        <div ref={bottomRef} />
      </div>

      {error !== '' && (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      )}

      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t(L, 'chat.placeholder')}
          style={{ flex: 1, padding: 10, border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={thinking}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {t(L, 'chat.send')}
        </button>
      </form>
    </main>
  );
}
