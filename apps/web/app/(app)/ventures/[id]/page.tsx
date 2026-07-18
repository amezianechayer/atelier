import {
  actions,
  budgets,
  conversations,
  integrations,
  ledgerEvents,
  memoryDocs,
  messages,
  missions,
  outreachContacts,
  usageRecords,
  ventures,
} from '@atelier/db';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { CockpitLive } from './cockpit-live';

/** Cockpit venture (SPEC.md §10) : TOUT le business sur une page, activité réelle en tête. */
export default async function CockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');
  const { id } = await params;

  const db = getDb();
  const [venture] = await db
    .select()
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, found.user.id)));
  if (!venture) notFound();

  const [
    missionRows,
    actionRows,
    [budget],
    [spent],
    docRows,
    [contactStats],
    ledgerRows,
    integrationRows,
    [conversation],
  ] = await Promise.all([
    db
      .select({
        id: missions.id,
        agentRole: missions.agentRole,
        title: missions.title,
        instruction: missions.instruction,
        priority: missions.priority,
        status: missions.status,
        costActualUsd: missions.costActualUsd,
        resultSummary: missions.resultSummary,
      })
      .from(missions)
      .where(eq(missions.ventureId, id))
      .orderBy(asc(missions.priority), asc(missions.createdAt)),
    db
      .select({
        id: actions.id,
        class: actions.class,
        kind: actions.kind,
        payload: actions.payload,
        status: actions.status,
        requiresApproval: actions.requiresApproval,
      })
      .from(actions)
      .where(eq(actions.ventureId, id))
      .orderBy(desc(actions.createdAt))
      .limit(30),
    db.select().from(budgets).where(eq(budgets.ventureId, id)),
    db
      .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
      .from(usageRecords)
      .where(eq(usageRecords.ventureId, id)),
    db
      .select({
        slug: memoryDocs.slug,
        version: memoryDocs.version,
        createdAt: memoryDocs.createdAt,
      })
      .from(memoryDocs)
      .where(eq(memoryDocs.ventureId, id))
      .orderBy(asc(memoryDocs.slug), desc(memoryDocs.version)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        contacted: sql<number>`count(*) filter (where ${outreachContacts.contactedAt} is not null)::int`,
      })
      .from(outreachContacts)
      .where(eq(outreachContacts.ventureId, id)),
    db
      .select({ type: ledgerEvents.type, payload: ledgerEvents.payload, seq: ledgerEvents.seq })
      .from(ledgerEvents)
      .where(eq(ledgerEvents.ventureId, id))
      .orderBy(desc(ledgerEvents.seq))
      .limit(60),
    db
      .select({ kind: integrations.kind })
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, found.user.id),
          inArray(integrations.kind, ['github', 'vercel']),
        ),
      ),
    db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.ventureId, id), eq(conversations.channel, 'web'))),
  ]);

  const chatHistory = conversation
    ? await db
        .select({ id: messages.id, role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(asc(messages.id))
    : [];

  // Dernière version de chaque document mémoire.
  const docs: Array<{ slug: string; version: number; updatedAt: string }> = [];
  for (const row of docRows) {
    if (!docs.some((d) => d.slug === row.slug)) {
      docs.push({ slug: row.slug, version: row.version, updatedAt: row.createdAt.toISOString() });
    }
  }

  // URLs du site : dernier reçu d'exécution deploy_prod / deploy_preview du ledger.
  let productionUrl: string | null = null;
  let previewUrl: string | null = null;
  for (const event of ledgerRows) {
    if (event.type !== 'action_executed') continue;
    const p = event.payload as { kind?: string; receipt?: { externalUrl?: string | null } };
    const url = p.receipt?.externalUrl ?? null;
    if (!url) continue;
    if (p.kind === 'deploy_prod' && productionUrl === null) productionUrl = url;
    if (p.kind === 'deploy_preview' && previewUrl === null) previewUrl = url;
  }

  const connectedKinds = [...new Set(integrationRows.map((r) => r.kind))];

  return (
    <CockpitLive
      venture={{ id: venture.id, name: venture.name, pitch: venture.pitch, status: venture.status }}
      missions={missionRows.map((m) => ({ ...m, costActualUsd: String(m.costActualUsd) }))}
      actions={actionRows.map((a) => ({
        ...a,
        payload: a.payload as Record<string, unknown>,
      }))}
      budget={{
        spentUsd: Number(spent?.total ?? 0),
        monthlyLimitUsd: Number(budget?.monthlyLimitUsd ?? 0),
      }}
      docs={docs}
      contacts={{ total: contactStats?.total ?? 0, contacted: contactStats?.contacted ?? 0 }}
      site={{ productionUrl, previewUrl }}
      connectedKinds={connectedKinds}
      ledgerSeed={ledgerRows
        .slice()
        .reverse()
        .map((e) => ({ type: e.type, payload: e.payload as Record<string, unknown> }))}
      initialMessages={chatHistory.map((m) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
      }))}
    />
  );
}
