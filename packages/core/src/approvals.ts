/**
 * Classification A/B/C des actions (SPEC.md §2.5, §7) — appliquée EN CODE, jamais une
 * décision du modèle. Fail-closed partout : tout cas ambigu exige une approbation.
 */
import type { actions, Db } from '@atelier/db';
import type { ActionClass } from './index';

/** Ligne de la table actions (aperçu fidèle : le payload est le contenu exécutable exact). */
export type ActionRow = typeof actions.$inferSelect;

export interface ExecutorDeps {
  db: Db;
}

export interface ExecutionReceipt {
  summary: string;
  externalUrl?: string;
}

/** Exécution idempotente d'une action décidée, via le handler d'intégration (SPEC.md §7). */
export interface ActionExecutor {
  canHandle(kind: string): boolean;
  execute(a: ActionRow, deps: ExecutorDeps): Promise<ExecutionReceipt>;
  undo?(a: ActionRow, deps: ExecutorDeps): Promise<void>; // dépublier, rollback deploy
}

export type ActionKind =
  | 'draft_post'
  | 'publish_post'
  | 'send_email_batch'
  | 'deploy_preview'
  | 'deploy_prod'
  | 'code_change'
  | 'research_report'
  | 'dns_change'
  | 'spend';

/** Ligne d'autonomy_settings (SPEC.md §6) : niveau 0/1/2 + caps par sous-classe. */
export interface AutonomySetting {
  actionKind: string;
  level: number;
  cap: Record<string, unknown>;
}

/** Compteurs du jour, calculés par l'appelant (jamais par le modèle). */
export interface Counters {
  emailsToday: number;
  usdToday: number;
}

export interface ClassifyResult {
  class: ActionClass;
  requiresApproval: boolean;
  undoWindowMs?: number;
  reason: string;
}

/** Table normative kind -> classe (SPEC.md §2.5). */
const KIND_CLASS: Record<ActionKind, ActionClass> = {
  draft_post: 'A',
  research_report: 'A',
  code_change: 'A',
  deploy_preview: 'B',
  publish_post: 'C',
  send_email_batch: 'C',
  deploy_prod: 'C',
  dns_change: 'C',
  spend: 'C',
};

/** Fenêtre d'annulation du niveau 1 (auto + notif + undo). */
export const DEFAULT_UNDO_WINDOW_MS = 10 * 60 * 1000;

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Nombre d'emails d'un payload send_email_batch — undefined si illisible. */
function batchEmailCount(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.recipients)) return p.recipients.length;
  return asNumber(p.emailCount);
}

function spendAmountUsd(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return asNumber((payload as Record<string, unknown>).amountUsd);
}

export function classify(input: {
  ventureId: string;
  kind: string;
  payload: unknown;
  autonomy: AutonomySetting[];
  todayCounters: Counters;
}): ClassifyResult {
  const klass = (KIND_CLASS as Record<string, ActionClass | undefined>)[input.kind];

  if (klass === undefined) {
    return {
      class: 'C',
      requiresApproval: true,
      reason: `kind « ${input.kind} » inconnu : traité en classe C avec approbation (fail-closed).`,
    };
  }

  if (klass === 'A') {
    return {
      class: 'A',
      requiresApproval: false,
      reason: 'classe A : réversible et privé, exécution automatique.',
    };
  }
  if (klass === 'B') {
    return {
      class: 'B',
      requiresApproval: false,
      reason: 'classe B : visible mais réversible, exécution automatique avec notification.',
    };
  }

  // Classe C : irréversible ou public. Niveau d'autonomie par sous-classe.
  const setting = input.autonomy.find((s) => s.actionKind === input.kind);
  const level = setting?.level ?? 0;

  if (level === 1) {
    return {
      class: 'C',
      requiresApproval: false,
      undoWindowMs: DEFAULT_UNDO_WINDOW_MS,
      reason: `classe C, autonomie niveau 1 : exécution automatique avec notification et fenêtre d'annulation de ${DEFAULT_UNDO_WINDOW_MS / 60000} min.`,
    };
  }

  if (level === 2) {
    const cap = setting?.cap ?? {};
    if (input.kind === 'send_email_batch') {
      const maxPerDay = asNumber(cap.maxEmailsPerDay);
      const batch = batchEmailCount(input.payload);
      if (maxPerDay === undefined || batch === undefined) {
        return {
          class: 'C',
          requiresApproval: true,
          reason:
            'classe C niveau 2 : cap maxEmailsPerDay absent ou payload illisible — approbation requise (fail-closed).',
        };
      }
      if (input.todayCounters.emailsToday + batch > maxPerDay) {
        return {
          class: 'C',
          requiresApproval: true,
          reason: `classe C niveau 2 : plafond dépassé (${input.todayCounters.emailsToday} envoyés + ${batch} > cap ${maxPerDay}/jour) — approbation requise.`,
        };
      }
      return {
        class: 'C',
        requiresApproval: false,
        reason: `classe C niveau 2 : sous le plafond (${input.todayCounters.emailsToday + batch}/${maxPerDay} emails aujourd'hui), exécution automatique.`,
      };
    }
    if (input.kind === 'spend') {
      const maxUsd = asNumber(cap.maxUsd);
      const amount = spendAmountUsd(input.payload);
      if (maxUsd === undefined || amount === undefined) {
        return {
          class: 'C',
          requiresApproval: true,
          reason:
            'classe C niveau 2 : cap maxUsd absent ou montant illisible — approbation requise (fail-closed).',
        };
      }
      if (input.todayCounters.usdToday + amount > maxUsd) {
        return {
          class: 'C',
          requiresApproval: true,
          reason: `classe C niveau 2 : plafond dépassé (${input.todayCounters.usdToday.toFixed(2)} $ + ${amount.toFixed(2)} $ > cap ${maxUsd.toFixed(2)} $/jour) — approbation requise.`,
        };
      }
      return {
        class: 'C',
        requiresApproval: false,
        reason: `classe C niveau 2 : sous le plafond de dépense (${(input.todayCounters.usdToday + amount).toFixed(2)}/${maxUsd.toFixed(2)} $), exécution automatique.`,
      };
    }
    // Niveau 2 sur un kind sans logique de cap définie : fail-closed.
    return {
      class: 'C',
      requiresApproval: true,
      reason: `classe C niveau 2 : aucun plafond défini en code pour « ${input.kind} » — approbation requise (fail-closed).`,
    };
  }

  if (level !== 0) {
    return {
      class: 'C',
      requiresApproval: true,
      reason: `classe C : niveau d'autonomie ${level} invalide — approbation requise (fail-closed).`,
    };
  }

  return {
    class: 'C',
    requiresApproval: true,
    reason: 'classe C : irréversible ou public, approbation requise (niveau 0 par défaut).',
  };
}
