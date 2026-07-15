import { Inngest } from 'inngest';

/**
 * apps/web ne fait AUCUN travail long : il émet des événements Inngest,
 * apps/worker les traite (SPEC.md §3).
 */
export const inngest = new Inngest({
  id: 'atelier',
  isDev: process.env.NODE_ENV !== 'production',
});
