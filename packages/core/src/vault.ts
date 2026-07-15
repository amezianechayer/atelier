/**
 * Coffre à secrets utilisateurs — AES-256-GCM, clé maître en env (SPEC.md §11).
 * Le tag d'authentification (16 octets) est stocké en fin de ciphertext, pour coller
 * aux deux colonnes bytea (ciphertext, nonce) de la table secrets.
 * Pur Node stdlib : aucune dépendance.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptedSecret {
  ciphertext: Buffer;
  nonce: Buffer;
}

function parseMasterKey(masterKeyB64: string): Buffer {
  const key = Buffer.from(masterKeyB64, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== masterKeyB64) {
    throw new Error(
      "SECRETS_MASTER_KEY invalide : 32 octets encodés base64 attendus — générer avec : node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return key;
}

export function encryptSecret(masterKeyB64: string, plaintext: string): EncryptedSecret {
  const key = parseMasterKey(masterKeyB64);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]), nonce };
}

export function decryptSecret(masterKeyB64: string, sealed: EncryptedSecret): string {
  const key = parseMasterKey(masterKeyB64);
  if (sealed.ciphertext.length < TAG_BYTES) {
    throw new Error('Déchiffrement impossible : ciphertext tronqué.');
  }
  const tag = sealed.ciphertext.subarray(sealed.ciphertext.length - TAG_BYTES);
  const body = sealed.ciphertext.subarray(0, sealed.ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(
      'Déchiffrement impossible : secret altéré ou clé maître différente de celle du chiffrement.',
    );
  }
}
