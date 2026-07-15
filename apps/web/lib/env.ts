import { type Env, loadDotEnv, loadEnv } from '@atelier/config';

let cached: Env | undefined;

/** Env validé par zod, chargé une seule fois par process (crash immédiat si invalide). */
export function getEnv(): Env {
  if (!cached) {
    loadDotEnv(); // .env de la racine du monorepo (cwd de Next = apps/web)
    cached = loadEnv();
  }
  return cached;
}
