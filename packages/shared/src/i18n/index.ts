import en from './en.json';
import fr from './fr.json';

export const locales = { fr, en } as const;

export type Locale = keyof typeof locales;
export type MessageKey = keyof typeof fr;

// Garantit à la compilation que en.json couvre toutes les clés de fr.json.
const _enCoversAllKeys: Record<MessageKey, string> = en;

export const DEFAULT_LOCALE: Locale = 'fr';

export function t(locale: Locale, key: MessageKey): string {
  return locales[locale][key];
}
