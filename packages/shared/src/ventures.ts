import { z } from 'zod';

/** Schémas d'entrée/sortie de l'API ventures (SPEC.md §9) — réutilisés par le frontend. */

export const ventureStatusSchema = z.enum(['onboarding', 'active', 'paused', 'archived']);
export const briefChannelSchema = z.enum(['web', 'telegram', 'email']);

export const createVentureInputSchema = z.object({
  name: z.string().trim().min(1, 'donne un nom à ta venture').max(80, '80 caractères maximum'),
  pitch: z
    .string()
    .trim()
    .min(1, 'décris ton idée en quelques lignes')
    .max(2000, '2000 caractères maximum'),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type CreateVentureInput = z.infer<typeof createVentureInputSchema>;

export const updateVentureInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    pitch: z.string().trim().min(1).max(2000),
    status: ventureStatusSchema,
    nightShiftEnabled: z.boolean(),
    nightShiftHourLocal: z.number().int().min(0).max(23),
    timezone: z.string().trim().min(1).max(64),
    briefChannel: briefChannelSchema,
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'aucun champ à modifier' });
export type UpdateVentureInput = z.infer<typeof updateVentureInputSchema>;

export const ventureSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  pitch: z.string(),
  status: ventureStatusSchema,
  nightShiftEnabled: z.boolean(),
  nightShiftHourLocal: z.number().int(),
  timezone: z.string(),
  briefChannel: briefChannelSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type Venture = z.infer<typeof ventureSchema>;

/** Connexion d'une intégration par token (SPEC.md §16 Phase 1/4). */
export const connectGithubInputSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, 'ce token semble trop court')
    .max(255, 'ce token semble trop long'),
  /** Repo cible « owner/name » où le Builder pousse (Phase 4). Optionnel. */
  repo: z
    .string()
    .trim()
    .regex(/^[\w.-]+\/[\w.-]+$/, 'format attendu : owner/name')
    .optional(),
});
export type ConnectGithubInput = z.infer<typeof connectGithubInputSchema>;

export const connectVercelInputSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, 'ce token semble trop court')
    .max(255, 'ce token semble trop long'),
});
export type ConnectVercelInput = z.infer<typeof connectVercelInputSchema>;
