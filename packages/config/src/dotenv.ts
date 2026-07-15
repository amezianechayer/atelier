import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

/**
 * Charge le .env de la racine du monorepo dans process.env (sans écraser les
 * variables déjà définies — même sémantique que node --env-file).
 * Nécessaire car Next et tsx démarrent avec apps/web ou apps/worker comme cwd.
 */
export function loadDotEnv(startDir: string = process.cwd()): void {
  let dir = resolve(startDir);
  for (let depth = 0; depth < 4; depth++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
