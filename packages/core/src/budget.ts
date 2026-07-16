/**
 * Compteur électrique du produit (SPEC.md §7). hardExceeded => l'appelant DOIT
 * annuler la mission. Metering affiché et metering facturé sortent de la même
 * table usage_records (§11).
 */
import type { Db } from '@atelier/db';
import { budgets, nightCycles, usageRecords } from '@atelier/db';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';

export interface UsageInput {
  ventureId: string;
  missionId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageOutcome {
  remainingMonthUsd: number;
  remainingNightUsd: number | null;
  hardExceeded: boolean;
}

export async function recordUsage(db: Db, u: UsageInput): Promise<UsageOutcome> {
  return db.transaction(async (tx) => {
    await tx.insert(usageRecords).values({
      ventureId: u.ventureId,
      missionId: u.missionId ?? null,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costUsd: u.costUsd.toFixed(6),
    });

    const [budget] = await tx.select().from(budgets).where(eq(budgets.ventureId, u.ventureId));
    if (!budget) {
      // Aucune venture ne doit tourner sans plafond : fail-closed.
      return { remainingMonthUsd: 0, remainingNightUsd: null, hardExceeded: true };
    }

    const [month] = await tx
      .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.ventureId, u.ventureId),
          gte(usageRecords.recordedAt, sql`date_trunc('month', now())`),
        ),
      );
    const remainingMonthUsd = Number(budget.monthlyLimitUsd) - Number(month?.total ?? 0);

    let remainingNightUsd: number | null = null;
    const [cycle] = await tx
      .select({ startedAt: nightCycles.startedAt, budgetUsd: nightCycles.budgetUsd })
      .from(nightCycles)
      .where(and(eq(nightCycles.ventureId, u.ventureId), isNull(nightCycles.endedAt)))
      .orderBy(desc(nightCycles.startedAt))
      .limit(1);
    if (cycle) {
      const [night] = await tx
        .select({ total: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)` })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.ventureId, u.ventureId),
            gte(usageRecords.recordedAt, cycle.startedAt),
          ),
        );
      remainingNightUsd = Number(cycle.budgetUsd) - Number(night?.total ?? 0);
    }

    const hardExceeded =
      budget.hard &&
      (remainingMonthUsd <= 0 || (remainingNightUsd !== null && remainingNightUsd <= 0));

    return { remainingMonthUsd, remainingNightUsd, hardExceeded };
  });
}
