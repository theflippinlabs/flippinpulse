import { cookies, headers } from 'next/headers';

export type Locale = 'fr' | 'en';

// Public-facing pages (landing, /legal/*) live outside the authenticated
// dashboard, so they can't rely on the member-scoped locale cookie. This
// helper picks a locale in three steps:
//   1. explicit override cookie set by the LanguageSwitch component;
//   2. the visitor's Accept-Language header (first tag that starts with fr);
//   3. English as the default — the marketing site is EN-first for reach.
export const PUBLIC_LOCALE_COOKIE = 'novarys_public_locale';

export function getPublicLocale(): Locale {
  const override = cookies().get(PUBLIC_LOCALE_COOKIE)?.value;
  if (override === 'fr' || override === 'en') return override;
  const accept = headers().get('accept-language') ?? '';
  const first = accept.split(',')[0]?.trim().toLowerCase() ?? '';
  if (first.startsWith('fr')) return 'fr';
  return 'en';
}
