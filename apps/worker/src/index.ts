import { pino } from 'pino';
import { startInngestServer } from './inngest/server';
import { startOtel } from './otel';
import { getRuntime } from './runtime';

const logger = pino({ name: 'atelier-worker' });

// Crash immédiat si l'environnement est invalide (SPEC.md §15.7).
const runtime = getRuntime();
await startOtel(runtime.env);

startInngestServer();
logger.info(
  { nodeEnv: runtime.env.NODE_ENV, port: 3111 },
  'worker prêt : endpoint Inngest sur :3111/api/inngest (fonctions venture-onboard, chat-message)',
);
