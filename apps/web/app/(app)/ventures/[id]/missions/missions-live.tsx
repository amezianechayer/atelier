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

const STATUS_TAG: Record<string, string> = {
  backlog: 'tag',
  queued: 'tag-warn',
  running: 'tag-info',
  awaiting_approval: 'tag-warn',
  done: 'tag-ok',
  failed: 'tag-danger',
  cancelled: 'tag',
  budget_exceeded: 'tag-danger',
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
    <main className="page">
      <p className="crumb">
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
        {'   ·   '}
        <Link href={`/ventures/${props.ventureId}/actions`}>🛡️ {t(L, 'actions.title')}</Link>
      </p>
      <p className="eyebrow">{props.ventureName}</p>
      <h1>📋 {t(L, 'missions.title')}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {t(L, 'missions.subtitle')}
      </p>
      {error !== '' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      {items.length === 0 && <p className="muted">{t(L, 'missions.empty')}</p>}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 18 }}>
        {items.map((m) => (
          <li key={m.id} className="card">
            <div className="between">
              <strong>
                {ROLE_AVATARS[m.agentRole] ?? '•'} {m.title}
              </strong>
              <span className={`tag ${STATUS_TAG[m.status] ?? 'tag'}`}>
                {m.status === 'running' ? t(L, 'missions.running') : m.status}
              </span>
            </div>
            <p className="muted" style={{ margin: '8px 0 12px' }}>
              {m.instruction}
            </p>
            <div className="between">
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                P{m.priority} · {t(L, 'missions.cost')} {Number(m.costActualUsd).toFixed(4)} $
              </span>
              {(m.status === 'backlog' || m.status === 'failed') && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy === m.id}
                  onClick={() => run(m.id)}
                >
                  ▶ {t(L, 'missions.run')}
                </button>
              )}
            </div>
            {m.resultSummary && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Résultat</summary>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{m.resultSummary}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
