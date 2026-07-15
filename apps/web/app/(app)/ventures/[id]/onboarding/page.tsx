import { budgets, usageRecords, ventures } from '@atelier/db';
import { and, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { OnboardingLive } from './onboarding-live';

export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');
  const { id } = await params;

  const db = getDb();
  const [venture] = await db
    .select()
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, found.user.id)));
  if (!venture) notFound();

  const [budget] = await db.select().from(budgets).where(eq(budgets.ventureId, id));
  const [spent] = await db
    .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
    .from(usageRecords)
    .where(eq(usageRecords.ventureId, id));

  return (
    <OnboardingLive
      ventureId={id}
      ventureName={venture.name}
      initialStatus={venture.status}
      initialSpentUsd={Number(spent?.total ?? 0)}
      monthlyLimitUsd={Number(budget?.monthlyLimitUsd ?? 0)}
    />
  );
}
