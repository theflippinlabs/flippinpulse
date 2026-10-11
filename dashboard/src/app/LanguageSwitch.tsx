'use client';

import { useRouter } from 'next/navigation';

type Locale = 'fr' | 'en';

// Duplicated from lib/publicLocale.ts on purpose — importing it here would
// pull next/headers into the client bundle and break the Vercel build.
const PUBLIC_LOCALE_COOKIE = 'novarys_public_locale';

export function LanguageSwitch({ current }: { current: Locale }) {
  const router = useRouter();

  const setLocale = (next: Locale) => {
    if (next === current) return;
    // 1 year cookie so returning visitors keep their choice.
    document.cookie = `${PUBLIC_LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-pulse-border p-1 text-xs">
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`px-2.5 py-1 rounded-full transition-colors ${
          current === 'en' ? 'bg-pulse-gold text-black font-semibold' : 'text-pulse-mute hover:text-pulse-text'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale('fr')}
        className={`px-2.5 py-1 rounded-full transition-colors ${
          current === 'fr' ? 'bg-pulse-gold text-black font-semibold' : 'text-pulse-mute hover:text-pulse-text'
        }`}
      >
        FR
      </button>
    </div>
  );
}
