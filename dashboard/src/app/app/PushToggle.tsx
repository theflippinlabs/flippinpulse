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

  if (state === 'unsupported') return null;
  if (state === 'granted') {
    return (
      <div className="mx-3 mt-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-200">
        🔔 {fr ? 'Notifications actives' : 'Notifications active'}
      </div>
    );
  }
  if (state === 'denied') return null;

  return (
    <div className="mx-3 mt-2 rounded-xl border border-pulse-gold/40 bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 p-3 flex items-center gap-3">
      <span className="text-xl leading-none">🔔</span>
      <div className="flex-1 text-xs">
        <div className="font-semibold text-pulse-gold">{fr ? 'Active les notifications' : 'Enable notifications'}</div>
        <div className="text-pulse-mute">{fr ? 'Pour être prévenu·e des cadeaux, défis et récaps.' : 'Get pinged on gifts, challenges and recaps.'}</div>
        {message && <div className="mt-1">{message}</div>}
      </div>
      <button onClick={enable} className="text-xs font-bold px-3 py-1.5 rounded-full bg-pulse-gold text-black">
        {fr ? 'Activer' : 'Enable'}
      </button>
    </div>
  );
}
