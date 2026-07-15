import { loadDotEnv, loadEnv } from '@atelier/config';
import { pino } from 'pino';
import { startOtel } from './otel';

const logger = pino({ name: 'atelier-worker' });

// Crash immédiat si l'environnement est invalide (SPEC.md §15.7).
loadDotEnv();
const env = loadEnv();
await startOtel(env);

logger.info({ nodeEnv: env.NODE_ENV }, 'worker démarré (squelette Phase 0)');
logger.info(
  'À venir — Phase 2 : endpoint Inngest + agents CEO/Researcher ; Phase 4 : sandbox Builder ; Phase 6 : bot Telegram.',
);
