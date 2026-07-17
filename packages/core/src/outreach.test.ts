import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  enforcePlanQuota,
  filterSendable,
  makeUnsubscribeToken,
  normalizeEmail,
  type OutreachContact,
  verifyUnsubscribeToken,
} from './outreach';

/**
 * TDD strict (SPEC.md §15.4). Tests table-driven écrits AVANT l'implémentation.
 * Propriété exigée : AUCUN chemin de code ne peut envoyer un email présent dans la
 * suppression list — filterSendable est le seul point d'entrée qui produit la liste
 * d'envoi, le test l'attaque par toutes les variantes publiques.
 */

const contact = (email: string, over: Partial<OutreachContact> = {}): OutreachContact => ({
  email,
  status: 'new',
  source: 'salon B2B 2026',
  ...over,
});

describe('normalizeEmail', () => {
  it.each([
    ['  Jean@Exemple.FR  ', 'jean@exemple.fr'],
    ['A@B.C', 'a@b.c'],
    ['deja@bas.fr', 'deja@bas.fr'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });
});

describe('filterSendable — suppression list non contournable (SPEC.md §2.10, §8.4)', () => {
  it('retire les emails de la suppression list (comparaison normalisée)', () => {
    const res = filterSendable({
      contacts: [contact('ok@a.fr'), contact('STOP@b.fr'), contact('ok2@c.fr')],
      suppressionList: ['stop@b.fr'],
    });
    expect(res.sendable.map((c) => c.email)).toEqual(['ok@a.fr', 'ok2@c.fr']);
    expect(res.removed).toContainEqual({ email: 'STOP@b.fr', reason: 'suppression_list' });
  });

  it.each([
    'stop@b.fr',
    'STOP@B.FR',
    'Stop@B.fr',
    '  stop@b.fr  ',
    'stop@b.fr ',
  ])('la suppression list bloque « %s » quelle que soit la casse/espaces', (listed) => {
    const res = filterSendable({
      contacts: [contact('stop@b.fr'), contact('STOP@B.FR'), contact(' Stop@B.fr ')],
      suppressionList: [listed],
    });
    expect(res.sendable).toHaveLength(0);
  });

  it('PROPRIÉTÉ : un email supprimé ne passe JAMAIS, même statut new + source valide', () => {
    const suppressed = 'ne-jamais@contacter.fr';
    // Toutes les variantes publiques d'entrée d'un même email :
    const disguises = [
      suppressed,
      suppressed.toUpperCase(),
      `  ${suppressed}  `,
      `Ne-Jamais@Contacter.fr`,
    ];
    for (const disguise of disguises) {
      const res = filterSendable({
        contacts: [contact(disguise, { status: 'new', source: 'source légitime' })],
        suppressionList: [suppressed],
      });
      expect(res.sendable, `variante « ${disguise} »`).toHaveLength(0);
    }
  });

  it.each([
    ['unsubscribed', 'unsubscribed'],
    ['bounced', 'bounced'],
    ['replied', 'replied'],
  ] as const)('retire les contacts au statut %s', (status, reason) => {
    const res = filterSendable({ contacts: [contact('x@y.fr', { status })], suppressionList: [] });
    expect(res.sendable).toHaveLength(0);
    expect(res.removed[0]?.reason).toBe(reason);
  });

  it('refuse un contact sans source (import non sourcé interdit, SPEC.md §11)', () => {
    const res = filterSendable({
      contacts: [contact('x@y.fr', { source: '' })],
      suppressionList: [],
    });
    expect(res.sendable).toHaveLength(0);
    expect(res.removed[0]?.reason).toBe('source_manquante');
  });

  it('skipContacted retire les déjà contactés', () => {
    const res = filterSendable({
      contacts: [contact('a@x.fr', { status: 'new' }), contact('b@x.fr', { status: 'contacted' })],
      suppressionList: [],
      skipContacted: true,
    });
    expect(res.sendable.map((c) => c.email)).toEqual(['a@x.fr']);
  });

  it('déduplique les contacts (même email normalisé) sans doublon d’envoi', () => {
    const res = filterSendable({
      contacts: [contact('dup@x.fr'), contact('DUP@x.fr')],
      suppressionList: [],
    });
    expect(res.sendable).toHaveLength(1);
  });
});

describe('enforcePlanQuota (SPEC.md §12)', () => {
  it.each([
    // [quota mensuel, déjà envoyés, demandés, autorisés, dépassé]
    [200, 0, 5, 5, false],
    [200, 198, 5, 2, true],
    [200, 200, 1, 0, true],
    [0, 0, 1, 0, true], // plan free : 0 email
    [1000, 100, 50, 50, false],
  ])('quota=%i envoyés=%i demandés=%i -> autorisés=%i dépassé=%s', (q, sent, req, allowed, exc) => {
    const r = enforcePlanQuota({ monthlyQuota: q, sentThisMonth: sent, requested: req });
    expect(r.allowed).toBe(allowed);
    expect(r.exceeded).toBe(exc);
    expect(r.remaining).toBe(Math.max(0, q - sent));
  });
});

describe('token unsubscribe HMAC (stateless, infalsifiable, SPEC.md §8.4)', () => {
  const secret = randomBytes(32).toString('base64');
  const ventureId = '11111111-1111-4111-8111-111111111111';

  it('aller-retour : le token se vérifie et rend venture + email normalisé', () => {
    const token = makeUnsubscribeToken(secret, ventureId, '  Client@Boite.FR ');
    expect(verifyUnsubscribeToken(secret, token)).toEqual({
      ventureId,
      email: 'client@boite.fr',
    });
  });

  it('un token falsifié (payload modifié) est rejeté', () => {
    const token = makeUnsubscribeToken(secret, ventureId, 'a@b.fr');
    const [payload, sig] = token.split('.');
    const forged = `${Buffer.from('99999999-9999-4999-8999-999999999999:evil@x.fr').toString('base64url')}.${sig}`;
    expect(verifyUnsubscribeToken(secret, forged)).toBeNull();
    expect(payload).toBeTruthy();
  });

  it('une mauvaise clé rejette le token', () => {
    const token = makeUnsubscribeToken(secret, ventureId, 'a@b.fr');
    expect(verifyUnsubscribeToken(randomBytes(32).toString('base64'), token)).toBeNull();
  });

  it.each(['', 'nimporte', 'a.b.c', 'YQ.YQ'])('rejette un token malformé « %s »', (bad) => {
    expect(verifyUnsubscribeToken(secret, bad)).toBeNull();
  });
});
