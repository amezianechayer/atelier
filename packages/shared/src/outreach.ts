import { z } from 'zod';

/** Import de contacts de prospection (SPEC.md §11) : la source est OBLIGATOIRE. */
export const importContactsInputSchema = z.object({
  contacts: z
    .array(
      z.object({
        email: z.email('email invalide'),
        firstName: z.string().trim().max(120).optional(),
        company: z.string().trim().max(160).optional(),
      }),
    )
    .min(1)
    .max(500),
  /** Provenance commune du lot — refus si absente (interdiction des imports non sourcés). */
  source: z.string().trim().min(3, 'indique la provenance des contacts').max(200),
});
export type ImportContactsInput = z.infer<typeof importContactsInputSchema>;
