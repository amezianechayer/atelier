'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import { type FormEvent, useState } from 'react';

const L = DEFAULT_LOCALE;

type ConnectState = 'idle' | 'saving' | 'done' | 'error';

function useConnect(kind: 'github' | 'vercel') {
  const [state, setState] = useState<ConnectState>('idle');
  const [message, setMessage] = useState('');

  async function connect(body: Record<string, string>) {
    setState('saving');
    setMessage('');
    const res = await fetch(`/api/v1/integrations/${kind}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setState('done');
      setMessage(t(L, 'settings.connectSuccess'));
    } else {
      const parsed = (await res.json().catch(() => null)) as {
        error?: { message?: string; hint?: string };
      } | null;
      setState('error');
      setMessage(
        [parsed?.error?.message, parsed?.error?.hint].filter(Boolean).join(' ') ||
          t(L, 'error.generic'),
      );
    }
  }
  return { state, message, connect };
}

function StatusTag({ connected }: { connected: boolean }) {
  return (
    <span className={`tag ${connected ? 'tag-ok' : 'tag-warn'}`}>
      {connected ? `✓ ${t(L, 'settings.connected')}` : t(L, 'settings.notConnected')}
    </span>
  );
}

function Feedback({ state, message }: { state: ConnectState; message: string }) {
  if (message === '') return null;
  return (
    <p
      role={state === 'error' ? 'alert' : 'status'}
      style={{ margin: '10px 0 0', color: state === 'error' ? 'var(--danger)' : 'var(--ok)' }}
    >
      {message}
    </p>
  );
}

export function SettingsForms(props: {
  github: Record<string, unknown> | null;
  vercel: Record<string, unknown> | null;
  telegram: Record<string, unknown> | null;
}) {
  const gh = useConnect('github');
  const vc = useConnect('vercel');
  const [ghToken, setGhToken] = useState('');
  const [ghRepo, setGhRepo] = useState(
    typeof props.github?.repo === 'string' ? props.github.repo : '',
  );
  const [vcToken, setVcToken] = useState('');

  const githubConnected = props.github !== null || gh.state === 'done';
  const vercelConnected = props.vercel !== null || vc.state === 'done';

  async function submitGithub(e: FormEvent) {
    e.preventDefault();
    await gh.connect(ghRepo.trim() !== '' ? { token: ghToken, repo: ghRepo } : { token: ghToken });
    setGhToken('');
  }
  async function submitVercel(e: FormEvent) {
    e.preventDefault();
    await vc.connect({ token: vcToken });
    setVcToken('');
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="between">
          <strong>🐙 GitHub</strong>
          <StatusTag connected={githubConnected} />
        </div>
        <p className="muted" style={{ margin: '6px 0 14px', fontSize: '0.9rem' }}>
          {t(L, 'settings.github.help')}
          {typeof props.github?.login === 'string' && (
            <>
              {' '}
              — compte <strong>{String(props.github.login)}</strong>
              {typeof props.github?.repo === 'string' && (
                <>
                  , repo <strong>{String(props.github.repo)}</strong>
                </>
              )}
            </>
          )}
        </p>
        <form onSubmit={submitGithub} className="stack" style={{ gap: 10 }}>
          <div>
            <label htmlFor="gh-token">{t(L, 'settings.github.tokenLabel')}</label>
            <input
              id="gh-token"
              type="password"
              required
              autoComplete="off"
              placeholder="ghp_…"
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="gh-repo">{t(L, 'settings.github.repoLabel')}</label>
            <input
              id="gh-repo"
              placeholder="mon-compte/mon-repo"
              value={ghRepo}
              onChange={(e) => setGhRepo(e.target.value)}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-sm" disabled={gh.state === 'saving'}>
              {gh.state === 'saving' ? t(L, 'common.loading') : t(L, 'settings.connect')}
            </button>
          </div>
        </form>
        <Feedback state={gh.state} message={gh.message} />
      </section>

      <section className="card">
        <div className="between">
          <strong>▲ Vercel</strong>
          <StatusTag connected={vercelConnected} />
        </div>
        <p className="muted" style={{ margin: '6px 0 14px', fontSize: '0.9rem' }}>
          {t(L, 'settings.vercel.help')}
        </p>
        <form onSubmit={submitVercel} className="stack" style={{ gap: 10 }}>
          <div>
            <label htmlFor="vc-token">{t(L, 'settings.vercel.tokenLabel')}</label>
            <input
              id="vc-token"
              type="password"
              required
              autoComplete="off"
              placeholder="vcp_…"
              value={vcToken}
              onChange={(e) => setVcToken(e.target.value)}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-sm" disabled={vc.state === 'saving'}>
              {vc.state === 'saving' ? t(L, 'common.loading') : t(L, 'settings.connect')}
            </button>
          </div>
        </form>
        <Feedback state={vc.state} message={vc.message} />
      </section>

      <TelegramCard telegram={props.telegram} />

      <section className="card" style={{ opacity: 0.85 }}>
        <div className="between">
          <strong>📣 Buffer (Facebook · LinkedIn · X)</strong>
          <span className="tag">bientôt</span>
        </div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
          {t(L, 'settings.buffer.help')}
        </p>
      </section>
    </div>
  );
}

function TelegramCard({ telegram }: { telegram: Record<string, unknown> | null }) {
  const [command, setCommand] = useState('');
  const [state, setState] = useState<ConnectState>('idle');
  const linked = typeof telegram?.chatId === 'string';
  const username = typeof telegram?.username === 'string' ? String(telegram.username) : null;

  async function generate() {
    setState('saving');
    const res = await fetch('/api/v1/integrations/telegram/link-code', { method: 'POST' });
    if (res.ok) {
      const body = (await res.json()) as { command: string };
      setCommand(body.command);
      setState('done');
    } else {
      setState('error');
    }
  }

  return (
    <section className="card">
      <div className="between">
        <strong>✈️ Telegram</strong>
        <StatusTag connected={linked} />
      </div>
      <p className="muted" style={{ margin: '6px 0 14px', fontSize: '0.9rem' }}>
        {t(L, 'settings.telegram.help')}
        {linked && username && (
          <>
            {' '}
            — compte <strong>@{username}</strong>
          </>
        )}
      </p>
      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={generate}
          disabled={state === 'saving'}
        >
          {state === 'saving' ? t(L, 'common.loading') : t(L, 'settings.telegram.generate')}
        </button>
      </div>
      {command !== '' && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>
            {t(L, 'settings.telegram.codeHint')}
          </p>
          <code
            className="mono"
            style={{
              display: 'inline-block',
              border: '1px solid var(--line-strong)',
              padding: '6px 12px',
              fontSize: '1rem',
              userSelect: 'all',
            }}
          >
            {command}
          </code>
        </div>
      )}
      {state === 'error' && (
        <p role="alert" style={{ margin: '10px 0 0', color: 'var(--danger)' }}>
          {t(L, 'error.generic')}
        </p>
      )}
    </section>
  );
}
