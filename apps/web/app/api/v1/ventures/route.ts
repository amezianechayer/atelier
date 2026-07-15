import { budgets, ventures } from '@atelier/db';
import { createVentureInputSchema, PLANS } from '@atelier/shared';
import { desc, eq } from 'drizzle-orm';
import { apiError, parseJsonBody, requireUser } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { inngest } from '@/lib/inngest';
import { logger } from '@/lib/logger';

export async function GET(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const rows = await getDb()
    .select()
    .from(ventures)
    .where(eq(ventures.userId, user.id))
    .orderBy(desc(ventures.createdAt));
  return Response.json({ ventures: rows });
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const input = await parseJsonBody(request, createVentureInputSchema);
  if (input instanceof Response) return input;

  const plan = PLANS[user.plan];
  const db = getDb();

  const owned = await db
    .select({ id: ventures.id })
    .from(ventures)
    .where(eq(ventures.userId, user.id));
  if (owned.length >= plan.maxVentures) {
    return apiError(
      403,
      'plan_limit',
      `Ton plan ${user.plan} permet ${plan.maxVentures} venture(s).`,
      'Archive une venture ou passe au plan supérieur dans Réglages > Facturation.',
    );
  }

  const created = await db.transaction(async (tx) => {
    const [venture] = await tx
      .insert(ventures)
      .values({
        userId: user.id,
        name: input.name,
        pitch: input.pitch,
        ...(input.timezone ? { timezone: input.timezone } : {}),
      })
      .returning();
    if (!venture) throw new Error('insertion venture échouée');
    // Budget par défaut du plan (SPEC.md §12) — jamais de venture sans plafond.
    await tx.insert(budgets).values({
      ventureId: venture.id,
      monthlyLimitUsd: plan.aiBudgetUsdPerMonth.toFixed(2),
      nightLimitUsd: getEnv().DEFAULT_NIGHT_LIMIT_USD.toFixed(2),
    });
    return venture;
  });

  // Déclenche l'onboarding (SPEC.md §8.1) — traité par apps/worker.
  let onboardingQueued = true;
  try {
    await inngest.send({ name: 'venture.created', data: { ventureId: created.id } });
  } catch (err) {
    onboardingQueued = false;
    logger.error({ err, ventureId: created.id }, "échec d'émission de venture.created");
  }
  return Response.json({ venture: created, onboardingQueued }, { status: 201 });
}
