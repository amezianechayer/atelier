import { loadEnv } from '@atelier/config';
import { pino } from 'pino';

const logger = pino({ name: 'atelier-worker' });

// Crash immédiat si l'environnement est invalide (SPEC.md §15.7).
const env = loadEnv();

logger.info({ nodeEnv: env.NODE_ENV }, 'worker démarré (squelette Phase 0)');
logger.info(
  'À venir — Phase 2 : endpoint Inngest + agents CEO/Researcher ; Phase 4 : sandbox Builder ; Phase 6 : bot Telegram.',
);
