/** Constantes de plans (SPEC.md §12). Les quotas sont appliqués EN CODE (Phase 8). */

export type PlanId = 'free' | 'starter' | 'pro' | 'scale';

export interface PlanLimits {
  /** Nombre maximum de ventures simultanées. */
  maxVentures: number;
  /** Budget IA inclus, en USD par mois. */
  aiBudgetUsdPerMonth: number;
  /** Night shift autorisée. */
  nightShift: boolean;
  /** Quota d'emails de prospection par mois. */
  emailsPerMonth: number;
  /** Prix de l'abonnement, en EUR par mois. */
  priceEurPerMonth: number;
  /** Watermark "assisté par IA" imposé sur la landing générée. */
  landingWatermark: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    maxVentures: 1,
    aiBudgetUsdPerMonth: 2,
    nightShift: false,
    emailsPerMonth: 0,
    priceEurPerMonth: 0,
    landingWatermark: true,
  },
  starter: {
    maxVentures: 1,
    aiBudgetUsdPerMonth: 15,
    nightShift: true,
    emailsPerMonth: 200,
    priceEurPerMonth: 29,
    landingWatermark: false,
  },
  pro: {
    maxVentures: 3,
    aiBudgetUsdPerMonth: 50,
    nightShift: true,
    emailsPerMonth: 1000,
    priceEurPerMonth: 79,
    landingWatermark: false,
  },
  scale: {
    maxVentures: 10,
    aiBudgetUsdPerMonth: 150,
    nightShift: true,
    // [HYPOTHÈSE] la spec dit "quotas étendus" sans chiffre — à confirmer par le fondateur.
    emailsPerMonth: 5000,
    priceEurPerMonth: 199,
    landingWatermark: false,
  },
};

/** Top-up : 10 $ par tranche, opt-in double-confirmé, plafond mensuel défini par l'utilisateur. */
export const TOPUP_INCREMENT_USD = 10;
