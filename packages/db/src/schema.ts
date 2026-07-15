/**
 * Schéma normatif (SPEC.md §6). Les colonnes, contraintes et enums sont contractuels.
 * Deux migrations SQL brutes accompagnent ce schéma :
 *  - 0000 : CREATE EXTENSION vector
 *  - 0002 : index HNSW sur memory_chunks.embedding + trigger append-only sur ledger_events
 */
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'scale']);
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  googleSub: text('google_sub').unique(),
  displayName: text('display_name'),
  plan: planEnum('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Colonnes requises par Better Auth (Phase 1, ADR 0004) — additives au schéma §6.
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Tables Better Auth (Phase 1, ADR 0004). Ids UUID générés par Postgres. ---
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ventureStatusEnum = pgEnum('venture_status', [
  'onboarding',
  'active',
  'paused',
  'archived',
]);
export const ventures = pgTable('ventures', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  pitch: text('pitch').notNull(),
  status: ventureStatusEnum('status').notNull().default('onboarding'),
  nightShiftEnabled: boolean('night_shift_enabled').notNull().default(false),
  nightShiftHourLocal: integer('night_shift_hour_local').notNull().default(2),
  timezone: text('timezone').notNull().default('Europe/Paris'),
  briefChannel: text('brief_channel', { enum: ['web', 'telegram', 'email'] })
    .notNull()
    .default('web'),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const secrets = pgTable('secrets', {
  // AES-256-GCM, clé maître en env
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ciphertext: bytea('ciphertext').notNull(),
  nonce: bytea('nonce').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Comptes externes DE L'UTILISATEUR (propriété des assets = différenciateur n°1)
export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ventureId: uuid('venture_id').references(() => ventures.id, { onDelete: 'cascade' }), // null = global
  kind: text('kind', {
    enum: ['github', 'vercel', 'cf_pages', 'resend', 'buffer', 'telegram'],
  }).notNull(),
  config: jsonb('config').notNull().default({}), // ids externes, JAMAIS de secrets
  secretId: uuid('secret_id').references(() => secrets.id),
  status: text('status').notNull().default('connected'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentRoleEnum = pgEnum('agent_role', ['ceo', 'researcher', 'builder', 'marketer']);
export const missionStatusEnum = pgEnum('mission_status', [
  'backlog',
  'queued',
  'running',
  'awaiting_approval',
  'done',
  'failed',
  'cancelled',
  'budget_exceeded',
]);
export const missions = pgTable(
  'missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ventureId: uuid('venture_id')
      .notNull()
      .references(() => ventures.id, { onDelete: 'cascade' }),
    agentRole: agentRoleEnum('agent_role').notNull(),
    title: text('title').notNull(),
    instruction: text('instruction').notNull(),
    origin: text('origin', { enum: ['user_chat', 'ceo_backlog', 'night_shift'] }).notNull(),
    priority: integer('priority').notNull().default(3),
    status: missionStatusEnum('status').notNull().default('backlog'),
    costEstimateUsd: numeric('cost_estimate_usd', { precision: 10, scale: 4 }),
    costActualUsd: numeric('cost_actual_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    resultSummary: text('result_summary'),
    nightCycleId: uuid('night_cycle_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_missions_venture').on(t.ventureId, t.status)],
);

// Actions produites par les agents, classées A/B/C (coeur du modèle de confiance)
export const actionStatusEnum = pgEnum('action_status', [
  'pending',
  'auto_executed',
  'approved',
  'rejected',
  'executed',
  'undone',
  'expired',
]);
export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  missionId: uuid('mission_id')
    .notNull()
    .references(() => missions.id, { onDelete: 'cascade' }),
  ventureId: uuid('venture_id')
    .notNull()
    .references(() => ventures.id, { onDelete: 'cascade' }),
  class: text('class', { enum: ['A', 'B', 'C'] }).notNull(),
  kind: text('kind').notNull(), // draft_post|publish_post|send_email_batch|deploy_preview|deploy_prod|code_change|research_report|dns_change|spend
  payload: jsonb('payload').notNull(), // contenu exécutable exact (aperçu fidèle)
  status: actionStatusEnum('status').notNull().default('pending'),
  requiresApproval: boolean('requires_approval').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  undoDeadline: timestamp('undo_deadline', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const autonomySettings = pgTable(
  'autonomy_settings',
  {
    ventureId: uuid('venture_id')
      .notNull()
      .references(() => ventures.id, { onDelete: 'cascade' }),
    actionKind: text('action_kind').notNull(),
    level: integer('level').notNull().default(0), // 0 approbation, 1 auto+notif+undo, 2 auto
    cap: jsonb('cap').notNull().default({}), // ex: {"maxEmailsPerDay":50,"maxUsd":0}
  },
  (t) => [primaryKey({ columns: [t.ventureId, t.actionKind] })],
);

export const budgets = pgTable('budgets', {
  ventureId: uuid('venture_id')
    .primaryKey()
    .references(() => ventures.id, { onDelete: 'cascade' }),
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 10, scale: 2 }).notNull(),
  nightLimitUsd: numeric('night_limit_usd', { precision: 10, scale: 2 }).notNull().default('1.00'),
  hard: boolean('hard').notNull().default(true),
});

export const usageRecords = pgTable(
  'usage_records',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ventureId: uuid('venture_id')
      .notNull()
      .references(() => ventures.id, { onDelete: 'cascade' }),
    missionId: uuid('mission_id').references(() => missions.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_usage_venture_time').on(t.ventureId, t.recordedAt)],
);

// Journal append-only chaîné SHA-256. Un trigger SQL (migration brute) interdit UPDATE/DELETE.
export const ledgerEvents = pgTable(
  'ledger_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ventureId: uuid('venture_id')
      .notNull()
      .references(() => ventures.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    type: text('type').notNull(), // mission_state|action_created|action_decided|action_executed|message|usage|night_cycle|integration
    payload: jsonb('payload').notNull().default({}),
    prevHash: bytea('prev_hash'),
    hash: bytea('hash'),
  },
  (t) => [uniqueIndex('uq_ledger_venture_seq').on(t.ventureId, t.seq)],
);

export const memoryDocs = pgTable(
  'memory_docs',
  {
    // brand|icp|tone|decisions|learnings|product
    id: uuid('id').primaryKey().defaultRandom(),
    ventureId: uuid('venture_id')
      .notNull()
      .references(() => ventures.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    version: integer('version').notNull().default(1),
    content: text('content').notNull(),
    updatedByRole: text('updated_by_role'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_memory_slug_version').on(t.ventureId, t.slug, t.version)],
);

export const memoryChunks = pgTable('memory_chunks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ventureId: uuid('venture_id')
    .notNull()
    .references(() => ventures.id, { onDelete: 'cascade' }),
  source: text('source').notNull(), // chat|mission_result|brief
  sourceId: uuid('source_id'),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// Migration brute : index HNSW vector_cosine_ops sur memory_chunks.embedding.

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id, { onDelete: 'cascade' }), // null = globale
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  format: text('format').notNull().default('agentskills'),
  content: text('content').notNull(), // SKILL.md complet
  sourceMissionId: uuid('source_mission_id').references(() => missions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id')
    .notNull()
    .references(() => ventures.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['web', 'telegram'] }).notNull(),
  externalChatId: text('external_chat_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const messages = pgTable('messages', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'ceo', 'system'] }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const nightCycles = pgTable('night_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id')
    .notNull()
    .references(() => ventures.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  budgetUsd: numeric('budget_usd', { precision: 10, scale: 2 }).notNull(),
  spentUsd: numeric('spent_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  missionsRun: integer('missions_run').notNull().default(0),
  briefMd: text('brief_md'),
  briefSentAt: timestamp('brief_sent_at', { withTimezone: true }),
});

export const outreachContacts = pgTable(
  'outreach_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ventureId: uuid('venture_id')
      .notNull()
      .references(() => ventures.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    company: text('company'),
    firstName: text('first_name'),
    source: text('source').notNull(), // obligatoire : provenance du contact
    status: text('status', { enum: ['new', 'contacted', 'replied', 'unsubscribed', 'bounced'] })
      .notNull()
      .default('new'),
  },
  (t) => [uniqueIndex('uq_outreach_venture_email').on(t.ventureId, t.email)],
);

export const suppressionList = pgTable('suppression_list', {
  // globale plateforme, jamais contournable
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
