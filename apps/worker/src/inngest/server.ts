import { createServer, type Server } from 'node:http';
import { serve } from 'inngest/node';
import { chatMessage } from './chat';
import { inngest } from './client';
import { missionRun } from './mission';
import { ventureOnboard } from './onboard';

export const functions = [ventureOnboard, chatMessage, missionRun];

/** Endpoint Inngest du worker — le dev server compose pointe sur host:3111 (Phase 0). */
export const INNGEST_PORT = 3111;

export function startInngestServer(): Server {
  const handler = serve({ client: inngest, functions });
  const server = createServer(handler);
  server.listen(INNGEST_PORT);
  return server;
}
