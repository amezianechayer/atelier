import { ventures } from '@atelier/db';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ActionsLive } from './actions-live';

export default async function ActionsPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await getSessionUser(await headers());
  if (!found) redirect('/login');
  const { id } = await params;

  const [venture] = await getDb()
    .select({ id: ventures.id, name: ventures.name })
    .from(ventures)
    .where(and(eq(ventures.id, id), eq(ventures.userId, found.user.id)));
  if (!venture) notFound();

  return <ActionsLive ventureId={id} ventureName={venture.name} />;
}
