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

const STATUS_TAG: Record<string, string> = {
  pending: 'tag-warn',
  approved: 'tag-info',
  auto_executed: 'tag-ok',
  executed: 'tag-ok',
  rejected: 'tag-danger',
  expired: 'tag',
  undone: 'tag',
};

const KIND_LABEL: Record<string, string> = {
  publish_post: 'Publier un post',
  send_email_batch: 'Envoyer des emails',
  deploy_preview: 'Déployer une préversion',
  deploy_prod: 'Déployer en production',
  research_report: 'Rapport de recherche',
  draft_post: 'Brouillon de post',
};

/** Aperçu EXACT (SPEC.md §10) : ce qui sera exécuté, tel quel. */
function PayloadPreview({ action }: { action: ActionItem }) {
  const p = action.payload;
  // Déploiement : montre le projet, la branche et le nombre de fichiers.
  if (action.kind === 'deploy_preview' || action.kind === 'deploy_prod') {
    const files = p.files && typeof p.files === 'object' ? Object.keys(p.files as object) : [];
    return (
      <div className="stack" style={{ margin: '10px 0', gap: 6 }}>
        <div className="row">
          <span className="tag tag-info">projet {String(p.projectName ?? '?')}</span>
          <span className="tag">branche {String(p.branch ?? '?')}</span>
          <span className="tag">{files.length} fichiers</span>
        </div>
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Voir les fichiers déployés
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.85rem' }} className="muted">
            {files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      </div>
    );
  }
  const text = typeof p.text === 'string' ? p.text : typeof p.report === 'string' ? p.report : null;
  if (text) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid var(--accent)',
          margin: '10px 0',
          padding: '4px 14px',
          whiteSpace: 'pre-wrap',
          maxHeight: 240,
          overflowY: 'auto',
        }}
      >
        {text}
      </blockquote>
    );
  }
  return (
    <pre
      style={{
        background: 'var(--paper)',
        padding: 12,
        borderRadius: 8,
        overflowX: 'auto',
        fontSize: '0.82rem',
      }}
    >
      {JSON.stringify(p, null, 2)}
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
    <main className="page">
      <p className="crumb">
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
        {'   ·   '}
        <Link href={`/ventures/${props.ventureId}/missions`}>📋 {t(L, 'missions.title')}</Link>
      </p>
      <p className="eyebrow">{props.ventureName}</p>
      <h1>🛡️ {t(L, 'actions.title')}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {t(L, 'actions.subtitle')}
      </p>
      {error !== '' && (
        <p role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <h2>{t(L, 'actions.pendingSection')}</h2>
      {pending.length === 0 && <p className="muted">{t(L, 'actions.empty')}</p>}
      {pending.map((a) => (
        <div key={a.id} className="card card-accent reveal">
          <div className="between">
            <strong>{KIND_LABEL[a.kind] ?? a.kind}</strong>
            <span className="tag tag-accent">
              {t(L, 'actions.classLabel')} {a.class}
            </span>
          </div>
          <PayloadPreview action={a} />
          <div className="row">
            <button
              type="button"
              className="btn btn-ok btn-sm"
              disabled={busy === a.id}
              onClick={() => decide(a.id, 'approve')}
            >
              ✓ {t(L, 'common.approve')}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy === a.id}
              onClick={() => decide(a.id, 'reject')}
            >
              ✕ {t(L, 'common.reject')}
            </button>
          </div>
        </div>
      ))}

      <h2>{t(L, 'actions.historySection')}</h2>
      <div className="stack" style={{ gap: 8 }}>
        {history.map((a) => (
          <div
            key={a.id}
            className="between"
            style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}
          >
            <span>
              {KIND_LABEL[a.kind] ?? a.kind}{' '}
              <span className="muted">
                ({t(L, 'actions.classLabel')} {a.class})
              </span>
            </span>
            <span className={`tag ${STATUS_TAG[a.status] ?? 'tag'}`}>{a.status}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
