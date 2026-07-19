'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

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

interface ActionItem {
  id: string;
  class: 'A' | 'B' | 'C';
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  requiresApproval: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ceo' | 'system';
  content: string;
}

interface LedgerSeedEvent {
  type: string;
  payload: Record<string, unknown>;
}

const ROLE_AVATARS: Record<string, string> = {
  ceo: '🧭',
  researcher: '🔎',
  builder: '🛠️',
  marketer: '📣',
};

const MISSION_TAG: Record<string, string> = {
  backlog: 'tag',
  queued: 'tag-warn',
  running: 'tag-info',
  awaiting_approval: 'tag-warn',
  done: 'tag-ok',
  failed: 'tag-danger',
  cancelled: 'tag',
  budget_exceeded: 'tag-danger',
};

const KIND_LABEL: Record<string, string> = {
  publish_post: 'Publier un post',
  send_email_batch: 'Envoyer des emails',
  deploy_preview: 'Déployer une préversion',
  deploy_prod: 'Déployer en production',
  research_report: 'Rapport de recherche',
  draft_post: 'Brouillon de post',
};

const DOC_LABEL: Record<string, string> = {
  brand: 'Marque',
  icp: 'Client idéal',
  tone: 'Ton de voix',
  decisions: 'Décisions',
  learnings: 'Apprentissages',
  product: 'Produit',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Une ligne de terminal par événement du ledger (historique au chargement). */
function lineFromLedger(e: LedgerSeedEvent): string | null {
  const p = e.payload;
  switch (e.type) {
    case 'mission_state':
      return `mission · ${str(p.status)}`;
    case 'action_created':
      return `action ${str(p.kind)} [classe ${str(p.class)}] ${p.requiresApproval ? '→ ton accord' : 'auto'}`;
    case 'action_decided':
      return `décision · ${str(p.decision) || 'tranchée'}`;
    case 'action_executed': {
      const receipt = (p.receipt ?? {}) as { summary?: unknown; externalUrl?: unknown };
      const url = str(receipt.externalUrl);
      return `${str(p.kind)} ✓ ${str(receipt.summary)}${url ? ` — ${url}` : ''}`;
    }
    case 'usage': {
      const cost = Number(p.costUsd ?? 0);
      return cost > 0 ? `+${cost.toFixed(4)} $ · ${str(p.model)}` : null;
    }
    case 'integration':
      return `intégration ${str(p.kind)} connectée`;
    case 'night_cycle': {
      const phase = str(p.phase);
      if (phase === 'start')
        return `night shift · départ (plafond ${Number(p.budgetUsd ?? 0).toFixed(2)} $)`;
      if (phase === 'end')
        return `night shift · fin — ${Number(p.spentUsd ?? 0).toFixed(2)} $ dépensés, ${Number(p.pendingActions ?? 0)} à approuver`;
      return `night shift · ${phase || 'cycle'}`;
    }
    default:
      return null;
  }
}

/** Une ligne de terminal par événement SSE (activité en direct). */
function lineFromStream(e: Record<string, unknown>): string | null {
  switch (str(e.type)) {
    case 'mission.state':
      return `mission · ${str(e.status)}`;
    case 'mission.tool':
      return `builder → ${str(e.tool)}`;
    case 'action.created':
      return `action ${str(e.kind)} [classe ${str(e.class)}] ${e.requiresApproval ? '→ ton accord' : 'auto'}`;
    case 'action.decided':
      return `décision · ${str(e.decision) || 'tranchée'}`;
    case 'action.executed': {
      const receipt = (e.receipt ?? {}) as { summary?: unknown; externalUrl?: unknown };
      const url = str(receipt.externalUrl);
      return `${str(e.kind)} ✓ ${str(receipt.summary)}${url ? ` — ${url}` : ''}`;
    }
    case 'action.error':
      return `erreur · ${str(e.message) || str(e.kind)}`;
    case 'usage': {
      const cost = Number(e.costUsd ?? 0);
      return cost > 0 ? `+${cost.toFixed(4)} $ · ${str(e.model)}` : null;
    }
    case 'chat.done':
      return 'CEO · réponse envoyée';
    case 'night.cycle':
      return `night shift · départ (plafond ${Number(e.budgetUsd ?? 0).toFixed(2)} $, ${Number(e.missions ?? 0)} missions)`;
    case 'night.brief':
      return `☀️ brief du matin envoyé (${str(e.via)}) — ${Number(e.spentUsd ?? 0).toFixed(2)} $ / ${Number(e.budgetUsd ?? 0).toFixed(2)} $`;
    case 'onboarding.started':
      return 'onboarding · démarré';
    case 'onboarding.section':
      return `onboarding · ${str(e.section)}`;
    case 'onboarding.done':
      return 'onboarding · terminé ✓';
    default:
      return null;
  }
}

/** Aperçu compact d'une action en attente (l'aperçu EXACT complet vit sur /actions). */
function actionPreview(a: ActionItem): string {
  const p = a.payload;
  if (a.kind === 'send_email_batch') {
    const n = Array.isArray(p.recipients) ? p.recipients.length : 0;
    return `« ${str(p.subject)} » → ${n} destinataire(s)`;
  }
  if (a.kind === 'deploy_preview' || a.kind === 'deploy_prod') {
    const files = p.files && typeof p.files === 'object' ? Object.keys(p.files as object) : [];
    return `projet ${str(p.projectName) || '?'} · branche ${str(p.branch) || '?'} · ${files.length} fichiers`;
  }
  const text = str(p.text) || str(p.report) || str(p.body);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

export function CockpitLive(props: {
  venture: { id: string; name: string; pitch: string; status: string };
  missions: MissionItem[];
  actions: ActionItem[];
  budget: { spentUsd: number; monthlyLimitUsd: number };
  night: {
    enabled: boolean;
    hourLocal: number;
    timezone: string;
    briefChannel: 'web' | 'telegram' | 'email';
    nightLimitUsd: number;
    lastCycle: {
      briefMd: string | null;
      spentUsd: number;
      budgetUsd: number;
      endedAt: string | null;
    } | null;
  };
  docs: Array<{ slug: string; version: number; updatedAt: string }>;
  contacts: { total: number; contacted: number };
  site: { productionUrl: string | null; previewUrl: string | null };
  connectedKinds: string[];
  ledgerSeed: LedgerSeedEvent[];
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const vid = props.venture.id;

  // ---- Terminal ----
  const nextLineId = useRef(0);
  const [lines, setLines] = useState<Array<{ id: number; text: string }>>(() =>
    props.ledgerSeed
      .map(lineFromLedger)
      .filter((l): l is string => l !== null)
      .slice(-30)
      .map((text) => ({ id: nextLineId.current++, text })),
  );
  const pushLine = useCallback((text: string) => {
    setLines((prev) => [...prev.slice(-39), { id: nextLineId.current++, text }]);
  }, []);

  // ---- Données vivantes ----
  const [missionItems, setMissionItems] = useState(props.missions);
  const [actionItems, setActionItems] = useState(props.actions);
  const [spentUsd, setSpentUsd] = useState(props.budget.spentUsd);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refetchMissions = useCallback(async () => {
    const res = await fetch(`/api/v1/ventures/${vid}/backlog`);
    if (res.ok) {
      const body = (await res.json()) as { missions: MissionItem[] };
      setMissionItems(body.missions);
    }
  }, [vid]);

  const refetchActions = useCallback(async () => {
    const res = await fetch(`/api/v1/ventures/${vid}/actions`);
    if (res.ok) {
      const body = (await res.json()) as { actions: ActionItem[] };
      setActionItems(body.actions);
    }
  }, [vid]);

  // ---- Night shift ----
  const [nsEnabled, setNsEnabled] = useState(props.night.enabled);
  const [nsHour, setNsHour] = useState(props.night.hourLocal);
  const [nsChannel, setNsChannel] = useState<string>(props.night.briefChannel);
  const [nsState, setNsState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function saveNight() {
    setNsState('saving');
    const res = await fetch(`/api/v1/ventures/${props.venture.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nightShiftEnabled: nsEnabled,
        nightShiftHourLocal: nsHour,
        briefChannel: nsChannel,
      }),
    });
    setNsState(res.ok ? 'saved' : 'error');
  }

  // ---- Chat ----
  const [history, setHistory] = useState<ChatMessage[]>(props.initialMessages);
  const [pending, setPending] = useState('');
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState('');
  const railScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource(`/api/v1/ventures/${vid}/stream`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as Record<string, unknown>;
      const type = str(event.type);

      if (type === 'chat.delta' && str(event.text)) {
        setPending((p) => p + str(event.text));
      } else if (type === 'chat.done') {
        setPending((finalText) => {
          if (finalText !== '') {
            setHistory((h) => [...h, { id: `ceo-${Date.now()}`, role: 'ceo', content: finalText }]);
          }
          return '';
        });
        setThinking(false);
      }

      const line = lineFromStream(event);
      if (line) pushLine(line);

      if (type === 'usage') setSpentUsd((s) => s + Number(event.costUsd ?? 0));
      if (type === 'mission.state') void refetchMissions();
      if (type.startsWith('action.')) {
        void refetchActions();
        if (type === 'action.executed') router.refresh(); // site, stats, documents
      }
    };
    return () => source.close();
  }, [vid, pushLine, refetchMissions, refetchActions, router]);

  // Ne fait défiler QUE le rail de chat — jamais la page (le flux SSE re-rend souvent).
  useEffect(() => {
    const el = railScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  async function runMission(missionId: string) {
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
    void refetchMissions();
  }

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
    void refetchActions();
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (content === '' || thinking) return;
    setError('');
    setInput('');
    setHistory((h) => [...h, { id: `user-${Date.now()}`, role: 'user', content }]);
    setThinking(true);
    const res = await fetch(`/api/v1/chat/${vid}/messages`, {
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

  const pendingActions = actionItems.filter((a) => a.status === 'pending' && a.requiresApproval);
  const openMissions = missionItems.filter((m) => m.status !== 'done' && m.status !== 'cancelled');
  const doneMissions = missionItems.length - openMissions.length;
  const postsPending = pendingActions.filter((a) => a.kind === 'publish_post').length;
  const limit = props.budget.monthlyLimitUsd;
  const ratio = limit > 0 ? Math.min(spentUsd / limit, 1) : 0;
  const githubOk = props.connectedKinds.includes('github');
  const vercelOk = props.connectedKinds.includes('vercel');

  return (
    <>
      {/* Activité réelle des agents — chaque ligne vient du ledger ou du flux SSE. */}
      <div className="term" role="log" aria-label="Activité des agents">
        {lines.length === 0 ? (
          <div className="term-line term-idle">{t(L, 'cockpit.terminalIdle')}</div>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="term-line">
              {l.text}
            </div>
          ))
        )}
      </div>

      <header className="appbar">
        <div className="row" style={{ gap: 18 }}>
          <Link href="/app" className="brand">
            Atelier<span className="spark">.</span>
          </Link>
          <span className="mono muted" style={{ letterSpacing: '0.08em' }}>
            / {props.venture.name.toUpperCase()}
          </span>
          <span className={`tag ${props.venture.status === 'active' ? 'tag-ok' : 'tag-info'}`}>
            {props.venture.status}
          </span>
        </div>
        <nav className="row" style={{ gap: 8 }}>
          <Link href={`/ventures/${vid}/onboarding`} className="btn btn-ghost btn-sm">
            {t(L, 'app.openOnboarding')}
          </Link>
          <Link href="/settings" className="btn btn-ghost btn-sm">
            {t(L, 'app.openSettings')}
          </Link>
        </nav>
      </header>

      <div className="cockpit">
        <main className="cockpit-main">
          {/* Colonne 1 — le business en chiffres */}
          <div>
            <section className="panel">
              <h2 className="panel-title" style={{ border: 'none', padding: 0 }}>
                <span style={{ fontSize: '1.9rem' }}>{props.venture.name}</span>
              </h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                {props.venture.pitch}
              </p>
            </section>

            <section className="panel">
              <h3 className="panel-title">{t(L, 'cockpit.business')}</h3>
              <dl style={{ margin: 0 }}>
                <div className="stat">
                  <dt>{t(L, 'cockpit.status')}</dt>
                  <dd>{props.venture.status}</dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.budgetSpent')}</dt>
                  <dd>{spentUsd.toFixed(4)} $</dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.budgetLimit')}</dt>
                  <dd>{limit.toFixed(2)} $</dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.approvalsPending')}</dt>
                  <dd>{pendingActions.length}</dd>
                </div>
              </dl>
              <div className="gauge">
                <div className="gauge-track">
                  <div
                    className={`gauge-fill${ratio > 0.85 ? ' hot' : ''}`}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </div>
                <div className="gauge-row">
                  <span>
                    {spentUsd.toFixed(2)} $ {t(L, 'budget.spent')}
                  </span>
                  <span>{limit.toFixed(2)} $</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <h3 className="panel-title">🌙 {t(L, 'cockpit.night.title')}</h3>
              <label
                className="row"
                htmlFor="ns-on"
                style={{ gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: '0.9rem' }}
              >
                <input
                  id="ns-on"
                  type="checkbox"
                  checked={nsEnabled}
                  onChange={(e) => setNsEnabled(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                {t(L, 'cockpit.night.enable')}
              </label>
              <dl style={{ margin: 0 }}>
                <div className="stat">
                  <dt>{t(L, 'cockpit.night.hour')}</dt>
                  <dd>
                    <select
                      value={nsHour}
                      onChange={(e) => setNsHour(Number(e.target.value))}
                      className="mono"
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                        <option key={`h${h}`} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>{' '}
                    <span className="muted">{props.night.timezone}</span>
                  </dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.night.channel')}</dt>
                  <dd>
                    <select
                      value={nsChannel}
                      onChange={(e) => setNsChannel(e.target.value)}
                      className="mono"
                    >
                      <option value="web">{t(L, 'cockpit.night.channelWeb')}</option>
                      <option value="telegram">{t(L, 'cockpit.night.channelTelegram')}</option>
                    </select>
                  </dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.night.limit')}</dt>
                  <dd>{props.night.nightLimitUsd.toFixed(2)} $</dd>
                </div>
              </dl>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={saveNight}
                  disabled={nsState === 'saving'}
                >
                  {nsState === 'saving' ? t(L, 'common.loading') : t(L, 'common.save')}
                </button>
                {nsState === 'saved' && (
                  <span className="mono" style={{ color: 'var(--ok)' }}>
                    {t(L, 'common.saved')}
                  </span>
                )}
                {nsState === 'error' && (
                  <span className="mono" style={{ color: 'var(--danger)' }}>
                    {t(L, 'error.generic')}
                  </span>
                )}
              </div>
              {props.night.lastCycle?.briefMd ? (
                <details>
                  <summary className="mono muted" style={{ cursor: 'pointer' }}>
                    ☀️ {t(L, 'cockpit.night.lastBrief')} —{' '}
                    {props.night.lastCycle.spentUsd.toFixed(2)} $ /{' '}
                    {props.night.lastCycle.budgetUsd.toFixed(2)} $
                  </summary>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: '0.86rem',
                      margin: '8px 0 0',
                      background: 'var(--card)',
                      border: '1px solid var(--line-strong)',
                      padding: 12,
                    }}
                  >
                    {props.night.lastCycle.briefMd}
                  </pre>
                </details>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
                  {t(L, 'cockpit.night.none')}
                </p>
              )}
            </section>

            <section className="panel">
              <h3 className="panel-title">{t(L, 'cockpit.website')}</h3>
              {props.site.productionUrl || props.site.previewUrl ? (
                <dl style={{ margin: 0 }}>
                  {props.site.productionUrl && (
                    <div className="stat">
                      <dt>{t(L, 'cockpit.production')}</dt>
                      <dd>
                        <a href={props.site.productionUrl} target="_blank" rel="noreferrer">
                          {props.site.productionUrl.replace('https://', '')}
                        </a>
                      </dd>
                    </div>
                  )}
                  {props.site.previewUrl && (
                    <div className="stat">
                      <dt>{t(L, 'cockpit.preview')}</dt>
                      <dd>
                        <a href={props.site.previewUrl} target="_blank" rel="noreferrer">
                          {props.site.previewUrl.replace('https://', '')}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  {t(L, 'cockpit.noSite')}
                </p>
              )}
            </section>

            <section className="panel">
              <h3 className="panel-title">{t(L, 'cockpit.integrations')}</h3>
              <dl style={{ margin: 0 }}>
                <div className="stat">
                  <dt>GitHub</dt>
                  <dd>
                    {githubOk ? (
                      <span className="tag tag-ok">✓</span>
                    ) : (
                      <Link href="/settings">{t(L, 'settings.connect')}</Link>
                    )}
                  </dd>
                </div>
                <div className="stat">
                  <dt>Vercel</dt>
                  <dd>
                    {vercelOk ? (
                      <span className="tag tag-ok">✓</span>
                    ) : (
                      <Link href="/settings">{t(L, 'settings.connect')}</Link>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {/* Colonne 2 — tâches + documents */}
          <div>
            <section className="panel">
              <div className="between">
                <h3 className="panel-title" style={{ flex: 1 }}>
                  {t(L, 'cockpit.tasks')}
                </h3>
                <Link href={`/ventures/${vid}/missions`} className="mono muted">
                  {t(L, 'cockpit.tasksManage')}
                </Link>
              </div>
              {openMissions.length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  {t(L, 'missions.empty')}
                </p>
              )}
              {openMissions.slice(0, 6).map((m) => (
                <article key={m.id} className="taskbox">
                  <div className="between">
                    <span className="taskbox-title">
                      {ROLE_AVATARS[m.agentRole] ?? '•'} {m.title}
                    </span>
                    <span className={`tag ${MISSION_TAG[m.status] ?? 'tag'}`}>
                      {m.status === 'running' ? t(L, 'missions.running') : m.status}
                    </span>
                  </div>
                  <p>
                    {m.instruction.length > 150 ? `${m.instruction.slice(0, 150)}…` : m.instruction}
                  </p>
                  <div className="between">
                    <span className="mono muted">
                      P{m.priority}
                      {Number(m.costActualUsd) > 0 && ` · ${Number(m.costActualUsd).toFixed(4)} $`}
                    </span>
                    {(m.status === 'backlog' || m.status === 'failed') && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy === m.id}
                        onClick={() => runMission(m.id)}
                      >
                        ▶ {t(L, 'missions.run')}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {doneMissions > 0 && (
                <p className="mono muted" style={{ margin: 0 }}>
                  ✓ {doneMissions} mission(s) terminée(s) —{' '}
                  <Link href={`/ventures/${vid}/missions`}>{t(L, 'cockpit.tasksManage')}</Link>
                </p>
              )}
            </section>

            <section className="panel">
              <h3 className="panel-title">{t(L, 'cockpit.documents')}</h3>
              {props.docs.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  {t(L, 'app.openOnboarding')} →
                </p>
              ) : (
                <dl style={{ margin: 0 }}>
                  {props.docs.map((d) => (
                    <div key={d.slug} className="stat">
                      <dt>
                        <Link href={`/ventures/${vid}/onboarding`}>
                          {DOC_LABEL[d.slug] ?? d.slug}
                        </Link>
                      </dt>
                      <dd>v{d.version}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </div>

          {/* Colonne 3 — approbations + marketing */}
          <div>
            <section className="panel">
              <div className="between">
                <h3 className="panel-title" style={{ flex: 1 }}>
                  🛡️ {t(L, 'cockpit.approvals')}
                </h3>
                <Link href={`/ventures/${vid}/actions`} className="mono muted">
                  {t(L, 'cockpit.tasksManage')}
                </Link>
              </div>
              {error !== '' && (
                <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
                  {error}
                </p>
              )}
              {pendingActions.length === 0 && (
                <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  {t(L, 'cockpit.approvalsEmpty')}
                </p>
              )}
              {pendingActions.slice(0, 4).map((a) => (
                <article key={a.id} className="taskbox" style={{ borderColor: 'var(--accent)' }}>
                  <div className="between">
                    <span className="taskbox-title">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    <span className="tag tag-accent">
                      {t(L, 'actions.classLabel')} {a.class}
                    </span>
                  </div>
                  <p>{actionPreview(a)}</p>
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
                    <Link href={`/ventures/${vid}/actions`} className="mono muted">
                      aperçu exact →
                    </Link>
                  </div>
                </article>
              ))}
            </section>

            <section className="panel">
              <h3 className="panel-title">{t(L, 'cockpit.marketing')}</h3>
              <dl style={{ margin: 0 }}>
                <div className="stat">
                  <dt>{t(L, 'cockpit.contacts')}</dt>
                  <dd>{props.contacts.total}</dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.emailsSent')}</dt>
                  <dd>{props.contacts.contacted}</dd>
                </div>
                <div className="stat">
                  <dt>{t(L, 'cockpit.postsPending')}</dt>
                  <dd>{postsPending}</dd>
                </div>
              </dl>
            </section>
          </div>
        </main>

        {/* Rail droit — ton CEO */}
        <aside className="cockpit-rail">
          <div className="rail-head">
            <strong style={{ fontFamily: 'var(--serif)', fontSize: '1.05rem' }}>
              🧭 {t(L, 'cockpit.chatTitle')}
            </strong>
            <span className="mono muted" style={{ fontSize: '0.65rem' }}>
              {t(L, 'cockpit.chatHint')}
            </span>
          </div>
          <div className="rail-scroll" ref={railScrollRef}>
            {history.length === 0 && pending === '' && (
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                {t(L, 'chat.empty')}
              </p>
            )}
            {history.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-ceo'}`}
              >
                {m.content}
              </div>
            ))}
            {pending !== '' && <div className="bubble bubble-ceo">{pending}▌</div>}
            {thinking && pending === '' && <p className="muted">{t(L, 'chat.thinking')}</p>}
          </div>
          <form onSubmit={sendChat} className="rail-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t(L, 'chat.placeholder')}
            />
            <button type="submit" className="btn" disabled={thinking}>
              {t(L, 'chat.send')}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
