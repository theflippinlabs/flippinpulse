'use client';

import { useLocale } from '@/lib/i18n-client';

export default function LocaleToggle() {
  const locale = useLocale();
  const flip = () => {
    const next = locale === 'fr' ? 'en' : 'fr';
    // 400-day cookie so the choice sticks between sessions.
    document.cookie = `novarys_locale=${next}; path=/; max-age=${60 * 60 * 24 * 400}; SameSite=Lax`;
    // Full reload so server components re-render in the new language.
    window.location.reload();
  };
  return (
    <button
      onClick={flip}
      className="text-[10px] px-2 py-1 rounded-lg bg-pulse-border/40 text-pulse-mute border border-pulse-border font-semibold hover:text-pulse-gold hover:border-pulse-gold/40"
      aria-label={`Switch to ${locale === 'fr' ? 'English' : 'French'}`}
    >
      {locale === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'}
    </button>
  );
}
