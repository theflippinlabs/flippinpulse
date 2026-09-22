'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'novarys_install_hint_dismissed';

// A discreet banner shown ONLY on iOS Safari when the app is not launched from
// the home screen. Once dismissed, we remember it in localStorage.
export default function InstallHint({ fr }: { fr: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* noop */ }
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (!isIOS) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) return;
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
    setShow(false);
  };

  return (
    <div className="mx-3 mt-3 mb-1 rounded-2xl border border-pulse-gold/40 bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 p-3 flex items-start gap-3">
      <span className="text-xl leading-none mt-0.5">📱</span>
      <div className="flex-1 text-xs leading-relaxed">
        {fr ? (
          <>
            <div className="font-semibold text-pulse-gold mb-0.5">Ajoute Novarys à ton écran d&apos;accueil</div>
            <div className="text-pulse-mute">Appuie sur <span className="mx-0.5 inline-block align-middle">⎘</span> Partager puis <b>« Sur l&apos;écran d&apos;accueil »</b>. L&apos;app s&apos;ouvrira comme une vraie appli, sans la barre du navigateur.</div>
          </>
        ) : (
          <>
            <div className="font-semibold text-pulse-gold mb-0.5">Add Novarys to your Home Screen</div>
            <div className="text-pulse-mute">Tap <span className="mx-0.5 inline-block align-middle">⎘</span> Share then <b>&quot;Add to Home Screen&quot;</b>. The app will open like a real app, no browser bar.</div>
          </>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-pulse-mute text-lg leading-none px-1">×</button>
    </div>
  );
}
