/**
 * Dev/CI uniquement : émule la migration "down" en droppant les schémas public et
 * drizzle (métadonnées de migrations) avant ré-application complète.
 * drizzle-kit ne génère pas de down migrations : voir docs/adr/0003-migrations-down.md.
 */
import pg from 'pg';

if (process.env.NODE_ENV === 'production') {
  console.error('db:reset est interdit en production.');
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? 'postgres://atelier:atelier@localhost:5432/atelier';
const client = new pg.Client({ connectionString: url });

await client.connect();
await client.query('DROP SCHEMA IF EXISTS public CASCADE');
await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
await client.query('CREATE SCHEMA public');
await client.query('GRANT ALL ON SCHEMA public TO public');
await client.end();

console.log('Base réinitialisée (schémas public et drizzle supprimés puis recréés).');
