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
    <main style={{ maxWidth: 760, margin: '4vh auto', padding: 24 }}>
      <p>
        <Link href="/app">{t(L, 'common.backToVentures')}</Link>
      </p>
      <h1>
        {props.ventureName} — {t(L, 'onboarding.title')}
      </h1>
      <p style={{ color: '#555' }}>{t(L, 'onboarding.subtitle')}</p>

      {/* Jauge de budget TOUJOURS visible (SPEC.md §10) */}
      <div style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <strong>{t(L, 'budget.remainingThisMonth')}</strong> : {spentUsd.toFixed(4)} $ /{' '}
        {props.monthlyLimitUsd.toFixed(2)} $ {t(L, 'budget.spent')}
        <div style={{ background: '#eee', borderRadius: 4, height: 8, marginTop: 6 }}>
          <div
            style={{
              width: `${gaugePct}%`,
              background: gaugePct > 80 ? '#b00020' : '#111',
              height: 8,
              borderRadius: 4,
              transition: 'width .3s',
            }}
          />
        </div>
      </div>

      {error !== '' && (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      )}
      {!started && error === '' && <p>{t(L, 'onboarding.waiting')}</p>}

      {research !== '' && (
        <section style={sectionStyle}>
          <h2>
            {AGENT_AVATARS.researcher} {t(L, 'onboarding.section.research')}
          </h2>
          <pre ref={researchRef} style={preStyle}>
            {research}
          </pre>
        </section>
      )}

      {plan && (
        <section style={sectionStyle}>
          <h2>
            {AGENT_AVATARS.ceo} {t(L, 'onboarding.section.plan')}
          </h2>
          <p>
            <strong>{t(L, 'onboarding.plan.positioning')}</strong> : {plan.positioning}
          </p>
          <p>
            <strong>{t(L, 'onboarding.plan.icp')}</strong> : {plan.icp}
          </p>
          <p>
            <strong>{t(L, 'onboarding.plan.competitors')}</strong> :
          </p>
          <ul>
            {plan.competitors.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong> — {c.angle}
              </li>
            ))}
          </ul>
          <p>
            <strong>{t(L, 'onboarding.plan.pricing')}</strong> : {plan.pricing}
          </p>
          <p>
            <strong>{t(L, 'onboarding.plan.names')}</strong> : {plan.names.join(' · ')}
          </p>
        </section>
      )}

      {memorySlugs.length > 0 && (
        <section style={sectionStyle}>
          <h2>🧠 {t(L, 'onboarding.section.memory')}</h2>
          <p>{memorySlugs.map((s) => `✓ ${s}`).join('   ')}</p>
        </section>
      )}

      {backlog.length > 0 && (
        <section style={sectionStyle}>
          <h2>📋 {t(L, 'onboarding.section.backlog')}</h2>
          <ol>
            {backlog.map((m) => (
              <li key={m.title}>
                {AGENT_AVATARS[m.agentRole] ?? '•'} {m.title}{' '}
                <span style={{ color: '#888' }}>(P{m.priority})</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {done && (
        <section style={{ ...sectionStyle, borderColor: '#111' }}>
          <h2>🎉 {t(L, 'onboarding.done')}</h2>
          <p>
            <Link href={`/ventures/${props.ventureId}/chat`}>{t(L, 'onboarding.goChat')} →</Link>
          </p>
        </section>
      )}
    </main>
  );
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 16,
  marginTop: 16,
};

const preStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
  maxHeight: 280,
  overflowY: 'auto',
  margin: 0,
  color: '#333',
};
