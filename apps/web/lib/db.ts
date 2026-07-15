import { createDb, type Db } from '@atelier/db';
import { getEnv } from './env';

// Singleton survivant au HMR de Next en dev.
const globalStore = globalThis as { __atelierDb?: ReturnType<typeof createDb> };

export function getDb(): Db {
  globalStore.__atelierDb ??= createDb(getEnv().DATABASE_URL);
  return globalStore.__atelierDb.db;
}
