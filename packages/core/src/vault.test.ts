import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './vault';

const masterKey = () => randomBytes(32).toString('base64');

describe('coffre AES-256-GCM (SPEC.md §11)', () => {
  describe('roundtrip chiffrement/déchiffrement', () => {
    it.each([
      ['token GitHub classique', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
      ['chaîne vide', ''],
      ['unicode et accents', 'clé secrète — 日本語 🗝️'],
      ['longue chaîne (10 Ko)', 'x'.repeat(10_240)],
      ['JSON sérialisé', JSON.stringify({ token: 'abc', scopes: ['repo', 'user'] })],
    ])('%s', (_label, plaintext) => {
      const key = masterKey();
      const sealed = encryptSecret(key, plaintext);
      expect(decryptSecret(key, sealed)).toBe(plaintext);
    });
  });

  it('le ciphertext ne contient jamais le clair', () => {
    const key = masterKey();
    const sealed = encryptSecret(key, 'super-secret-token');
    expect(sealed.ciphertext.includes(Buffer.from('super-secret-token'))).toBe(false);
  });

  it('deux chiffrements du même clair produisent nonces et ciphertexts distincts', () => {
    const key = masterKey();
    const a = encryptSecret(key, 'même-secret');
    const b = encryptSecret(key, 'même-secret');
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.nonce.length).toBe(12);
  });

  describe('intégrité : toute altération fait échouer le déchiffrement', () => {
    it.each([
      [
        'un octet du ciphertext',
        (s: { ciphertext: Buffer; nonce: Buffer }) => {
          const c = Buffer.from(s.ciphertext);
          const first = c[0] ?? 0;
          c[0] = first ^ 0xff;
          return { ...s, ciphertext: c };
        },
      ],
      [
        'un octet du tag (fin du ciphertext)',
        (s: { ciphertext: Buffer; nonce: Buffer }) => {
          const c = Buffer.from(s.ciphertext);
          const last = c[c.length - 1] ?? 0;
          c[c.length - 1] = last ^ 0x01;
          return { ...s, ciphertext: c };
        },
      ],
      [
        'un octet du nonce',
        (s: { ciphertext: Buffer; nonce: Buffer }) => {
          const n = Buffer.from(s.nonce);
          const first = n[0] ?? 0;
          n[0] = first ^ 0xff;
          return { ...s, nonce: n };
        },
      ],
    ])('altération de %s', (_label, tamper) => {
      const key = masterKey();
      const sealed = encryptSecret(key, 'secret-intègre');
      expect(() => decryptSecret(key, tamper(sealed))).toThrowError(/déchiffr/i);
    });
  });

  it('une mauvaise clé maître fait échouer le déchiffrement', () => {
    const sealed = encryptSecret(masterKey(), 'secret');
    expect(() => decryptSecret(masterKey(), sealed)).toThrowError(/déchiffr/i);
  });

  it.each([
    ['clé trop courte', randomBytes(16).toString('base64')],
    ['clé vide', ''],
    ['pas du base64', 'zzz!!!not-base64!!!'],
  ])('rejette une clé maître invalide (%s) avec un message actionnable', (_label, badKey) => {
    expect(() => encryptSecret(badKey, 'x')).toThrowError(/SECRETS_MASTER_KEY/);
  });
});
