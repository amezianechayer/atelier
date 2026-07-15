import { type Env, loadEnv } from '@atelier/config';

let cached: Env | undefined;

/** Env validé par zod, chargé une seule fois par process (crash immédiat si invalide). */
export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}
