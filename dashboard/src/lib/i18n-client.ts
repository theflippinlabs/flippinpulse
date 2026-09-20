'use client';

import { createContext, useContext } from 'react';
import { translations, type TranslationKey } from './translations';

export type Locale = 'fr' | 'en';

// Context used to hand the locale down from the server-rendered shell into
// every client component under it. Default 'fr' matches getLocale() default.
export const LocaleContext = createContext<Locale>('fr');

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

// Client-side translator. Same behavior as the server one but no cookie read.
export function tFor(locale: Locale, key: TranslationKey): string {
  const dict = translations[locale];
  const parts = key.split('.');
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
  if (locale !== 'fr') return tFor('fr', key);
  return key;
}

export function useT() {
  const locale = useLocale();
  return (key: TranslationKey): string => tFor(locale, key);
}

// Access an array key (e.g. novus.suggestions) — small helper so callers don't
// need to reach into the raw translations bundle.
export function tArray(locale: Locale, key: TranslationKey): string[] {
  const parts = key.split('.');
  let node: unknown = translations[locale];
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else { node = undefined; break; }
  }
  if (Array.isArray(node)) return node.filter((s): s is string => typeof s === 'string');
  if (locale !== 'fr') return tArray('fr', key);
  return [];
}

// Interpolation: replace {name} placeholders with values.
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
