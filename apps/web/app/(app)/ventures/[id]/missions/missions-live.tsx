'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const L = DEFAULT_LOCALE;

interface MissionItem {
  id: string;
  agentRole: string;
  title: string;
  instruction: string;
  priority: number;
  status: string;
  costActualUsd: string;
  resultSummary: string | null;
}

const ROLE_AVATARS: Record<string, string> = {
  ceo: '🧭',
  researcher: '🔎',
  builder: '🛠️',
  marketer: '📣',
};

const STATUS_COLORS: Record<string, string> = {
  backlog: '#6b7280',
  queued: '#b45309',
  running: '#1d4ed8',
  awaiting_approval: '#b45309',
  done: '#15803d',
  failed: '#b00020',
  cancelled: '#6b7280',
  budget_exceeded: '#b00020',
};

export function MissionsLive(props: { ventureId: string; ventureName: string }) {
  const [items, setItems] = useState<MissionItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/v1/ventures/${props.ventureId}/backlog`);
    if (res.ok) {
      const body = (await res.json()) as { missions: MissionItem[] };
      setItems(body.missions);
    }
  }, [props.ventureId]);

  useEffect(() => {
    void refetch();
    const source = new EventSource(`/api/v1/ventures/${props.ventureId}/stream`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as { type: string };
      if (event.type === 'mission.state' || event.type === 'action.executed') void refetch();
    };
    return () => source.close();
  }, [props.ventureId, refetch]);

  async function run(missionId: string) {
    setBusy(missionId);
    setError('');
    const res = await fetch(`/api/v1/missions/${missionId}/run`, { method: 'POST' });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? t(L, 'error.generic'));
    }
    setBusy(null);
    void refetch();
  }

  return (
    <main style={{ maxWidth: 760, margin: '4vh auto', padding: 24 }}>
      <p>
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
        {'   ·   '}
        <Link href={`/ventures/${props.ventureId}/actions`}>🛡️ {t(L, 'actions.title')}</Link>
      </p>
      <h1>
        📋 {props.ventureName} — {t(L, 'missions.title')}
      </h1>
      <p style={{ color: '#555' }}>{t(L, 'missions.subtitle')}</p>
      {error !== '' && (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      )}
      {items.length === 0 && <p style={{ color: '#777' }}>{t(L, 'missions.empty')}</p>}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
        {items.map((m) => (
          <li key={m.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>
                {ROLE_AVATARS[m.agentRole] ?? '•'} {m.title}
              </strong>
              <span style={{ color: STATUS_COLORS[m.status] ?? '#333', whiteSpace: 'nowrap' }}>
                {m.status === 'running' ? t(L, 'missions.running') : m.status}
              </span>
            </div>
            <p style={{ margin: '6px 0', color: '#555' }}>{m.instruction}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#888', fontSize: 13 }}>
                P{m.priority} · {t(L, 'missions.cost')} {Number(m.costActualUsd).toFixed(4)} $
              </span>
              {(m.status === 'backlog' || m.status === 'failed') && (
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => run(m.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid #111',
                    background: '#111',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  ▶ {t(L, 'missions.run')}
                </button>
              )}
            </div>
            {m.resultSummary && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', color: '#555' }}>Résultat</summary>
                <p style={{ whiteSpace: 'pre-wrap', color: '#333' }}>{m.resultSummary}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
