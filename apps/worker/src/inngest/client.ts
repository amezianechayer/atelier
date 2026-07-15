import { Inngest } from 'inngest';

/**
 * Client Inngest partagé du worker. En dev, le dev server (compose, port 8288)
 * découvre l'endpoint servi sur :3111 (docker/compose.dev.yml).
 */
export const inngest = new Inngest({
  id: 'atelier',
  isDev: process.env.NODE_ENV !== 'production',
});
