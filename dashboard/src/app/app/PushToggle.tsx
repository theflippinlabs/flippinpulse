'use client';

import { useEffect, useState } from 'react';

// base64-url decode of the server's VAPID public key into a Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof window !== 'undefined' ? window.atob(base64) : '';
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading';

export default function PushToggle({ fr }: { fr: boolean }) {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return; }
    setState(Notification.permission as State);
  }, []);

  // Auto-dismiss the post-activation confirmation toast after 4s.
  useEffect(() => {
    if (!message) return;
    const h = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(h);
  }, [message]);

  async function enable() {
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm as State); return; }
      const vapidRes = await fetch('/api/push/vapid');
      const vapid = await vapidRes.json();
      if (!vapid.publicKey) { setMessage(fr ? 'Notifications non configurées côté serveur.' : 'Notifications not configured on the server.'); return; }
      const keyBytes = urlBase64ToUint8Array(vapid.publicKey);
      // Copy into a fresh ArrayBuffer to satisfy DOM's stricter typing.
      const applicationServerKey = new Uint8Array(keyBytes).buffer;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) { setMessage(fr ? 'Enregistrement échoué.' : 'Registration failed.'); return; }
      setState('granted');
      setMessage(fr ? '✅ Notifications activées !' : '✅ Notifications enabled!');
    } catch {
      setMessage(fr ? 'Erreur d\'activation.' : 'Enable error.');
    }
  }

  // Once notifications are granted (or denied, or unsupported) there's
  // nothing useful to say — hide the banner completely so the hub stays
  // clean. The message toast is still shown briefly right after activation.
  if (state === 'unsupported' || state === 'granted' || state === 'denied') {
    if (message) {
      return (
        <div className="mx-3 mt-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
          {message}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mx-3 mt-2 rounded-xl border border-pulse-gold/40 bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 px-3 py-2 flex items-center gap-2">
      <span className="text-base leading-none">🔔</span>
      <div className="flex-1 text-[11px] min-w-0">
        <div className="font-semibold text-pulse-gold truncate">{fr ? 'Active les notifications' : 'Enable notifications'}</div>
        <div className="text-pulse-mute truncate">{fr ? 'Cadeaux, défis, récaps.' : 'Gifts, challenges, recaps.'}</div>
      </div>
      <button onClick={enable} className="text-[11px] font-bold px-3 py-1 rounded-full bg-pulse-gold text-black shrink-0">
        {fr ? 'Activer' : 'Enable'}
      </button>
    </div>
  );
}
