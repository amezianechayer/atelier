'use client';

import { DEFAULT_LOCALE, t } from '@atelier/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const L = DEFAULT_LOCALE;

interface Plan {
  positioning: string;
  icp: string;
  competitors: Array<{ name: string; angle: string }>;
  pricing: string;
  names: string[];
  tone: string;
  productBrief: string;
}

interface BacklogItem {
  title: string;
  agentRole: string;
  priority: number;
}

type StreamEvent = {
  type: string;
  section?: string;
  text?: string;
  plan?: Plan;
  slug?: string;
  missions?: BacklogItem[];
  costUsd?: number;
  totalCostUsd?: number;
  message?: string;
};

const AGENT_AVATARS: Record<string, string> = {
  researcher: '🔎',
  ceo: '🧭',
  builder: '🛠️',
  marketer: '📣',
};

export function OnboardingLive(props: {
  ventureId: string;
  ventureName: string;
  initialStatus: string;
  initialSpentUsd: number;
  monthlyLimitUsd: number;
}) {
  const [research, setResearch] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [memorySlugs, setMemorySlugs] = useState<string[]>([]);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [spentUsd, setSpentUsd] = useState(props.initialSpentUsd);
  const [done, setDone] = useState(props.initialStatus === 'active');
  const [error, setError] = useState('');
  const [started, setStarted] = useState(props.initialStatus === 'active');
  const researchRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (props.initialStatus === 'active') return;
    const source = new EventSource(`/api/v1/ventures/${props.ventureId}/stream`);
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as StreamEvent;
      switch (event.type) {
        case 'onboarding.started':
          setStarted(true);
          break;
        case 'onboarding.delta':
          if (event.section === 'research' && event.text) {
            setStarted(true);
            setResearch((r) => r + event.text);
            researchRef.current?.scrollTo({ top: researchRef.current.scrollHeight });
          }
          break;
        case 'onboarding.plan':
          if (event.plan) setPlan(event.plan);
          break;
        case 'onboarding.memory':
          if (event.slug) setMemorySlugs((s) => [...s, event.slug as string]);
          break;
        case 'onboarding.backlog':
          if (event.missions) setBacklog(event.missions);
          break;
        case 'usage':
          if (typeof event.costUsd === 'number') setSpentUsd((s) => s + (event.costUsd ?? 0));
          break;
        case 'onboarding.done':
          if (typeof event.totalCostUsd === 'number') setSpentUsd(event.totalCostUsd);
          setDone(true);
          source.close();
          break;
        case 'onboarding.error':
          setError(event.message ?? t(L, 'onboarding.error'));
          source.close();
          break;
        default:
          break;
      }
    };
    return () => source.close();
  }, [props.ventureId, props.initialStatus]);

  const gaugePct =
    props.monthlyLimitUsd > 0 ? Math.min(100, (spentUsd / props.monthlyLimitUsd) * 100) : 0;

  return (
    <main className="page">
      <p className="crumb">
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
      </p>
      <p className="eyebrow">{props.ventureName}</p>
      <h1>{t(L, 'onboarding.title')}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {t(L, 'onboarding.subtitle')}
      </p>

      {/* Jauge de budget TOUJOURS visible (SPEC.md §10) */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="gauge-row">
          <span>{t(L, 'budget.remainingThisMonth')}</span>
          <strong>
            {spentUsd.toFixed(4)} $ / {props.monthlyLimitUsd.toFixed(2)} $
          </strong>
        </div>
        <div className="gauge-track" style={{ marginTop: 8 }}>
          <div
            className={`gauge-fill${gaugePct > 80 ? ' hot' : ''}`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
      </div>

      {error !== '' && (
        <div className="card card-accent" style={{ marginTop: 14, borderColor: 'var(--danger)' }}>
          <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
            {error}
          </p>
        </div>
      )}
      {!started && error === '' && (
        <p className="muted" style={{ marginTop: 20 }}>
          {t(L, 'onboarding.waiting')}
        </p>
      )}

      {research !== '' && (
        <>
          <h2>
            {AGENT_AVATARS.researcher} {t(L, 'onboarding.section.research')}
          </h2>
          <div className="card reveal">
            <pre ref={researchRef} style={preStyle}>
              {research}
            </pre>
          </div>
        </>
      )}

      {plan && (
        <>
          <h2>
            {AGENT_AVATARS.ceo} {t(L, 'onboarding.section.plan')}
          </h2>
          <div className="card reveal stack">
            <div>
              <strong>{t(L, 'onboarding.plan.positioning')}</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                {plan.positioning}
              </p>
            </div>
            <div>
              <strong>{t(L, 'onboarding.plan.icp')}</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                {plan.icp}
              </p>
            </div>
            <div>
              <strong>{t(L, 'onboarding.plan.competitors')}</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {plan.competitors.map((c) => (
                  <li key={c.name}>
                    <strong>{c.name}</strong> — <span className="muted">{c.angle}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <strong>{t(L, 'onboarding.plan.pricing')}</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                {plan.pricing}
              </p>
            </div>
            <div className="row">
              <strong>{t(L, 'onboarding.plan.names')} :</strong>
              {plan.names.map((n, i) => (
                <span key={n} className={`tag ${i === 0 ? 'tag-accent' : ''}`}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {memorySlugs.length > 0 && (
        <>
          <h2>🧠 {t(L, 'onboarding.section.memory')}</h2>
          <div className="card reveal row">
            {memorySlugs.map((s) => (
              <span key={s} className="tag tag-ok">
                ✓ {s}
              </span>
            ))}
          </div>
        </>
      )}

      {backlog.length > 0 && (
        <>
          <h2>📋 {t(L, 'onboarding.section.backlog')}</h2>
          <div className="card reveal">
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
              {backlog.map((m) => (
                <li key={m.title}>
                  {AGENT_AVATARS[m.agentRole] ?? '•'} {m.title}{' '}
                  <span className="tag" style={{ marginLeft: 4 }}>
                    P{m.priority}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {done && (
        <div className="card card-accent reveal" style={{ marginTop: 20, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>🎉 {t(L, 'onboarding.done')}</h2>
          <Link className="btn btn-accent" href={`/ventures/${props.ventureId}/chat`}>
            {t(L, 'onboarding.goChat')} →
          </Link>
        </div>
      )}
    </main>
  );
}

const preStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
  maxHeight: 300,
  overflowY: 'auto',
  margin: 0,
  color: 'var(--ink)',
  lineHeight: 1.6,
};
