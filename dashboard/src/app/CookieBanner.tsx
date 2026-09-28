'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'novarys-cookie-consent-v1';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (!v) setVisible(true);
    } catch {
      // localStorage may be blocked (Safari private mode) — degrade silently.
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, at: Date.now() }));
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed bottom-3 inset-x-3 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md z-50 bg-pulse-card border border-pulse-border rounded-2xl p-4 shadow-2xl backdrop-blur"
    >
      <p className="text-sm text-pulse-text leading-relaxed">
        Novarys utilise uniquement des cookies techniques nécessaires (session, préférences
        de langue). Aucun cookie publicitaire ni de suivi tiers.{' '}
        <Link href="/legal/privacy" className="text-pulse-gold underline">
          En savoir plus
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={accept}
        className="mt-3 w-full sm:w-auto sm:px-4 py-2 rounded-lg bg-pulse-gold text-black text-sm font-semibold hover:opacity-90"
      >
        J&apos;ai compris
      </button>
    </div>
  );
}
