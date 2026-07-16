import { describe, expect, it } from 'vitest';
import { type AutonomySetting, type Counters, classify } from './approvals';

/**
 * TDD strict (SPEC.md §15.4) : la classification A/B/C est du CODE, jamais une
 * décision du modèle. Tests table-driven écrits AVANT l'implémentation.
 */

const NO_AUTONOMY: AutonomySetting[] = [];
const ZERO: Counters = { emailsToday: 0, usdToday: 0 };

function run(
  kind: string,
  opts: { payload?: unknown; autonomy?: AutonomySetting[]; counters?: Counters } = {},
) {
  return classify({
    ventureId: 'v-1',
    kind,
    payload: opts.payload ?? {},
    autonomy: opts.autonomy ?? NO_AUTONOMY,
    todayCounters: opts.counters ?? ZERO,
  });
}

describe('classify — table kind -> classe (SPEC.md §2.5)', () => {
  it.each([
    // [kind, classe, approbation requise par défaut]
    ['draft_post', 'A', false],
    ['research_report', 'A', false],
    ['code_change', 'A', false],
    ['deploy_preview', 'B', false],
    ['publish_post', 'C', true],
    ['send_email_batch', 'C', true],
    ['deploy_prod', 'C', true],
    ['dns_change', 'C', true],
    ['spend', 'C', true],
  ])('%s -> classe %s, approbation=%s (autonomie par défaut)', (kind, klass, approval) => {
    const res = run(kind);
    expect(res.class).toBe(klass);
    expect(res.requiresApproval).toBe(approval);
    expect(res.reason).not.toBe('');
  });

  it('kind inconnu -> classe C + approbation (fail-closed)', () => {
    const res = run('kind_jamais_vu');
    expect(res.class).toBe('C');
    expect(res.requiresApproval).toBe(true);
    expect(res.reason).toMatch(/inconnu/i);
  });
});

describe("classify — niveaux d'autonomie par sous-classe (SPEC.md §2.5)", () => {
  const level = (actionKind: string, lvl: number, cap: Record<string, unknown> = {}) =>
    [{ actionKind, level: lvl, cap }] satisfies AutonomySetting[];

  it('niveau 0 explicite : approbation requise', () => {
    const res = run('publish_post', { autonomy: level('publish_post', 0) });
    expect(res.requiresApproval).toBe(true);
  });

  it("niveau 1 : auto + fenêtre d'annulation", () => {
    const res = run('publish_post', { autonomy: level('publish_post', 1) });
    expect(res.requiresApproval).toBe(false);
    expect(res.undoWindowMs).toBeGreaterThan(0);
  });

  it("l'autonomie d'un autre kind ne déteint pas", () => {
    const res = run('deploy_prod', { autonomy: level('publish_post', 2, { maxUsd: 100 }) });
    expect(res.requiresApproval).toBe(true);
  });

  it("l'autonomie n'affecte pas les classes A/B", () => {
    const res = run('draft_post', { autonomy: level('draft_post', 0) });
    expect(res.class).toBe('A');
    expect(res.requiresApproval).toBe(false);
  });

  describe('niveau 2 : auto plafonné, appliqué en code', () => {
    it.each([
      // [emails déjà envoyés aujourd'hui, destinataires du batch, cap, approbation attendue]
      [0, 10, 50, false],
      [40, 10, 50, false],
      [41, 10, 50, true],
      [50, 1, 50, true],
    ])('send_email_batch : %i envoyés + %i destinataires / cap %i -> approbation=%s', (sent, batch, cap, expected) => {
      const res = run('send_email_batch', {
        autonomy: level('send_email_batch', 2, { maxEmailsPerDay: cap }),
        counters: { emailsToday: sent, usdToday: 0 },
        payload: { recipients: Array.from({ length: batch }, (_, i) => `p${i}@x.fr`) },
      });
      expect(res.requiresApproval).toBe(expected);
      if (expected) expect(res.reason).toMatch(/plafond|cap/i);
    });

    it.each([
      [0, 5, 10, false],
      [5, 5, 10, false],
      [5, 5.01, 10, true],
    ])('spend : %f $ dépensés + %f $ / cap %f $ -> approbation=%s', (spent, amount, cap, expected) => {
      const res = run('spend', {
        autonomy: level('spend', 2, { maxUsd: cap }),
        counters: { emailsToday: 0, usdToday: spent },
        payload: { amountUsd: amount },
      });
      expect(res.requiresApproval).toBe(expected);
    });

    it('niveau 2 sans cap pertinent -> approbation (config invalide, fail-closed)', () => {
      const res = run('send_email_batch', { autonomy: level('send_email_batch', 2, {}) });
      expect(res.requiresApproval).toBe(true);
    });

    it('payload illisible au niveau 2 -> approbation (fail-closed)', () => {
      const res = run('send_email_batch', {
        autonomy: level('send_email_batch', 2, { maxEmailsPerDay: 50 }),
        payload: 'pas un objet',
      });
      expect(res.requiresApproval).toBe(true);
    });

    it('niveau hors bornes (ex: 7) -> approbation (fail-closed)', () => {
      const res = run('publish_post', { autonomy: level('publish_post', 7) });
      expect(res.requiresApproval).toBe(true);
    });
  });
});
