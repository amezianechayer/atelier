'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const L = DEFAULT_LOCALE;

interface ActionItem {
  id: string;
  class: 'A' | 'B' | 'C';
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  requiresApproval: boolean;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#b45309',
  approved: '#1d4ed8',
  executed: '#15803d',
  rejected: '#b00020',
  expired: '#6b7280',
};

/** Aperçu EXACT (SPEC.md §10) : le post tel qu'il partira, sinon le payload brut. */
function PayloadPreview({ action }: { action: ActionItem }) {
  const text = typeof action.payload.text === 'string' ? action.payload.text : null;
  const report = typeof action.payload.report === 'string' ? action.payload.report : null;
  const content = text ?? report;
  if (content) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid #ccc',
          margin: '8px 0',
          padding: '4px 12px',
          whiteSpace: 'pre-wrap',
          color: '#333',
          maxHeight: 220,
          overflowY: 'auto',
        }}
      >
        {content}
      </blockquote>
    );
  }
  return (
    <pre style={{ background: '#f6f6f6', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
      {JSON.stringify(action.payload, null, 2)}
    </pre>
  );
}

export function ActionsLive(props: { ventureId: string; ventureName: string }) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/v1/ventures/${props.ventureId}/actions`);
    if (res.ok) {
      const body = (await res.json()) as { actions: ActionItem[] };
      setItems(body.actions);
    }
  }, [props.ventureId]);

  useEffect(() => {
    void refetch();
    const source = new EventSource(`/api/v1/ventures/${props.ventureId}/stream`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as { type: string };
      if (event.type.startsWith('action.')) void refetch();
    };
    return () => source.close();
  }, [props.ventureId, refetch]);

  async function decide(actionId: string, decision: 'approve' | 'reject') {
    setBusy(actionId);
    setError('');
    const res = await fetch(`/api/v1/actions/${actionId}/${decision}`, { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? t(L, 'actions.error'));
    }
    setBusy(null);
    void refetch();
  }

  const pending = items.filter((a) => a.status === 'pending' && a.requiresApproval);
  const history = items.filter((a) => !(a.status === 'pending' && a.requiresApproval));

  return (
    <main style={{ maxWidth: 760, margin: '4vh auto', padding: 24 }}>
      <p>
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
      </p>
      <h1>
        🛡️ {props.ventureName} — {t(L, 'actions.title')}
      </h1>
      <p style={{ color: '#555' }}>{t(L, 'actions.subtitle')}</p>
      {error !== '' && (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      )}

      <h2>{t(L, 'actions.pendingSection')}</h2>
      {pending.length === 0 && <p style={{ color: '#777' }}>{t(L, 'actions.empty')}</p>}
      {pending.map((a) => (
        <section
          key={a.id}
          style={{ border: '2px solid #b45309', borderRadius: 8, padding: 16, marginBottom: 12 }}
        >
          <p style={{ margin: 0 }}>
            <strong>{a.kind}</strong>{' '}
            <span style={{ color: '#666' }}>
              — {t(L, 'actions.classLabel')} {a.class}
            </span>
          </p>
          <PayloadPreview action={a} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => decide(a.id, 'approve')}
              style={{ ...buttonStyle, background: '#15803d', borderColor: '#15803d' }}
            >
              ✓ {t(L, 'common.approve')}
            </button>
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => decide(a.id, 'reject')}
              style={{ ...buttonStyle, background: '#b00020', borderColor: '#b00020' }}
            >
              ✕ {t(L, 'common.reject')}
            </button>
          </div>
        </section>
      ))}

      <h2>{t(L, 'actions.historySection')}</h2>
      {history.map((a) => (
        <p key={a.id} style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>
          <span style={{ color: STATUS_COLORS[a.status] ?? '#333', fontWeight: 600 }}>
            {a.status}
          </span>{' '}
          — {a.kind} ({t(L, 'actions.classLabel')} {a.class})
        </p>
      ))}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  border: '1px solid',
  color: '#fff',
  cursor: 'pointer',
};
