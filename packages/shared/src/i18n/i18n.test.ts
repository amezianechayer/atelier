import { describe, expect, it } from 'vitest';
import { locales, t } from './index';

describe('i18n', () => {
  it('fr et en exposent exactement les mêmes clés', () => {
    expect(Object.keys(locales.en).sort()).toEqual(Object.keys(locales.fr).sort());
  });

  it('aucune traduction vide', () => {
    for (const [localeName, messages] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value, `${localeName}:${key}`).not.toBe('');
      }
    }
  });

  it('t() résout une clé dans les deux langues', () => {
    expect(t('fr', 'common.appName')).toBe('Atelier');
    expect(t('en', 'common.approve')).toBe('Approve');
  });
});
