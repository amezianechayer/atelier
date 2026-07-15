import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applique les défauts de dev sur un environnement vide', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe('postgres://atelier:atelier@localhost:5432/atelier');
    expect(env.DEFAULT_NIGHT_LIMIT_USD).toBe(1.0);
    expect(env.SANDBOX_IMAGE).toBe('atelier/sandbox:dev');
  });

  it('rejette une DATABASE_URL non-postgres avec un message actionnable', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://nope' })).toThrowError(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://nope' })).toThrowError(/\.env\.example/);
  });

  it('accepte une SECRETS_MASTER_KEY de 32 octets base64', () => {
    const key = randomBytes(32).toString('base64');
    expect(loadEnv({ SECRETS_MASTER_KEY: key }).SECRETS_MASTER_KEY).toBe(key);
  });

  it.each([
    ['trop court', randomBytes(16).toString('base64')],
    ['pas du base64', 'pas-une-cle!!!'],
  ])('rejette une SECRETS_MASTER_KEY invalide (%s)', (_label, key) => {
    expect(() => loadEnv({ SECRETS_MASTER_KEY: key })).toThrowError(/SECRETS_MASTER_KEY/);
  });

  it('convertit DEFAULT_NIGHT_LIMIT_USD en nombre et rejette les valeurs non positives', () => {
    expect(loadEnv({ DEFAULT_NIGHT_LIMIT_USD: '2.50' }).DEFAULT_NIGHT_LIMIT_USD).toBe(2.5);
    expect(() => loadEnv({ DEFAULT_NIGHT_LIMIT_USD: '-1' })).toThrowError(
      /DEFAULT_NIGHT_LIMIT_USD/,
    );
  });

  it('exige DATABASE_URL, SECRETS_MASTER_KEY et BETTER_AUTH_SECRET explicites en production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrowError(/production/);
    const key = randomBytes(32).toString('base64');
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://prod:prod@db:5432/atelier',
        SECRETS_MASTER_KEY: key,
      }),
    ).toThrowError(/BETTER_AUTH_SECRET/);
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://prod:prod@db:5432/atelier',
      SECRETS_MASTER_KEY: key,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    });
    expect(env.NODE_ENV).toBe('production');
  });
});
