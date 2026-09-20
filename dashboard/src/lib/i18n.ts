import { cookies } from 'next/headers';
import { translations, type TranslationKey } from './translations';

export type Locale = 'fr' | 'en';
export const LOCALES: Locale[] = ['fr', 'en'];
export const LOCALE_COOKIE = 'novarys_locale';

// Read the current locale from the cookie (server-side). Defaults to FR.
export function getLocale(): Locale {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  return raw === 'en' ? 'en' : 'fr';
}

// Server-side translator. Falls back to FR if the key is missing in EN.
export function t(key: TranslationKey, locale: Locale = getLocale()): string {
  const dict = translations[locale];
  const parts = key.split('.');
  // Descend through the nested dictionary to reach a leaf string.
  let node: unknown = dict;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      node = undefined;
      break;
    }
  }
  if (typeof node === 'string') return node;
  if (locale !== 'fr') return t(key, 'fr');
  return key; // last resort — surfaces missing keys during dev
}
