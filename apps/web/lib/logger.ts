import { pino } from 'pino';

/** Logger serveur (API routes, auth). Jamais importé côté client. */
export const logger = pino({ name: 'atelier-web' });
