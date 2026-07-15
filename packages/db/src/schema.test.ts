import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from './schema';

/** Test de fumée : les noms de tables et enums contractuels de SPEC.md §6 sont tous là. */
describe('schéma Drizzle (SPEC.md §6)', () => {
  const expectedTables = [
    ['users', schema.users],
    ['ventures', schema.ventures],
    ['integrations', schema.integrations],
    ['secrets', schema.secrets],
    ['missions', schema.missions],
    ['actions', schema.actions],
    ['autonomy_settings', schema.autonomySettings],
    ['budgets', schema.budgets],
    ['usage_records', schema.usageRecords],
    ['ledger_events', schema.ledgerEvents],
    ['memory_docs', schema.memoryDocs],
    ['memory_chunks', schema.memoryChunks],
    ['skills', schema.skills],
    ['conversations', schema.conversations],
    ['messages', schema.messages],
    ['night_cycles', schema.nightCycles],
    ['outreach_contacts', schema.outreachContacts],
    ['suppression_list', schema.suppressionList],
  ] as const;

  it.each(expectedTables)('la table %s existe sous son nom contractuel', (name, table) => {
    expect(getTableName(table)).toBe(name);
  });

  it('les enums contractuels ont exactement les valeurs de la spec', () => {
    expect(schema.planEnum.enumValues).toEqual(['free', 'starter', 'pro', 'scale']);
    expect(schema.ventureStatusEnum.enumValues).toEqual([
      'onboarding',
      'active',
      'paused',
      'archived',
    ]);
    expect(schema.agentRoleEnum.enumValues).toEqual(['ceo', 'researcher', 'builder', 'marketer']);
    expect(schema.missionStatusEnum.enumValues).toEqual([
      'backlog',
      'queued',
      'running',
      'awaiting_approval',
      'done',
      'failed',
      'cancelled',
      'budget_exceeded',
    ]);
    expect(schema.actionStatusEnum.enumValues).toEqual([
      'pending',
      'auto_executed',
      'approved',
      'rejected',
      'executed',
      'undone',
      'expired',
    ]);
  });
});
