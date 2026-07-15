import { z } from 'zod';

/** Forme d'erreur contractuelle de l'API REST (SPEC.md §9). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    hint: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthzResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
});

export type HealthzResponse = z.infer<typeof healthzResponseSchema>;
