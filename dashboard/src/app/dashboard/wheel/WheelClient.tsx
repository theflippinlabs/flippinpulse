'use client';

import { useMemo, useRef, useState } from 'react';
import { pickDefaultShareChannel, type DiscordChannel } from '@/lib/channelTypes';

export interface MemberOpt {
  discord_id: string;
  username: string;
  avatar_url: string | null;
}

// Colorful slice palette — high contrast on the felt background. We cycle
// through them if there are more entries than colors.
const COLORS = [
  '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9',
  '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#84cc16', '#d97706',
];

// Truncate label so it fits along the slice.
function short(label: string, maxLen = 16): string {
  return label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;
}

export default function WheelClient({
  members,
  channels,
}: {
  members: MemberOpt[];
  channels: DiscordChannel[];
}) {
  const [rawText, setRawText] = useState('Option 1\nOption 2\nOption 3\nOption 4');
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  const [channelId, setChannelId] = useState<string>(pickDefaultShareChannel(channels));
  const [announceMsg, setAnnounceMsg] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef(0);

  const items = useMemo(
    () => rawText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40),
    [rawText],
  );

  const importMembers = (limit: number) => {
    const picks = members.slice(0, limit).map(m => m.username).filter(Boolean);
    setRawText(picks.join('\n'));
    setWinner(null);
  };

  const shuffle = () => {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setRawText(arr.join('\n'));
    setWinner(null);
  };

  const spin = () => {
    if (spinning || items.length < 2) return;
    setWinner(null);
    setError(null);
    setSpinning(true);
    const idx = Math.floor(Math.random() * items.length);
    const perSlice = 360 / items.length;
    // Land the middle of the winning slice at the top (pointer position).
    // Rotation is clockwise on the wheel; the pointer is at 0deg (top).
    // Add ~10 full turns for drama.
    const target = 360 * 10 - (idx * perSlice + perSlice / 2);
    // Accumulate on top of previous rotation to keep it smooth across spins.
    const previous = anchorRef.current;
    const delta = target - (previous % 360);
    const next = previous + (delta > 0 ? delta : delta + 360 * 10);
    setRotation(next);
    anchorRef.current = next;

    // Wait for the CSS transition to finish before revealing.
    setTimeout(() => {
      setWinner(items[idx]);
      setAnnounceMsg(`🎡 La roue a parlé — le gagnant est **${items[idx]}** ! 🎉`);
      setSpinning(false);
    }, 6200);
  };

  const announce = async () => {
    if (!winner || !channelId || !announceMsg.trim()) return;
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'announce',
          payload: {
            channel_id: channelId,
            title: '🎡 Résultat du tirage',
            message: announceMsg.trim(),
            embed: true,
            ping: null,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Échec.');
    }
  };

  const perSlice = items.length > 0 ? 360 / items.length : 0;

  return (
    <>
      {/* Wheel */}
      <div className="bg-gradient-to-br from-[#3a1f10] via-[#1a0f06] to-[#0a0605] border-2 border-pulse-gold/60 rounded-3xl p-4 mb-4 shadow-2xl">
        <div className="relative mx-auto" style={{ width: 300, height: 300 }}>
          {/* Gold outer bezel */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 25%, #F5B62E 0%, #B8860B 40%, #5a4008 100%)',
              boxShadow: 'inset 0 6px 14px rgba(255,255,255,0.25), inset 0 -8px 20px rgba(0,0,0,0.6), 0 12px 30px rgba(0,0,0,0.6)',
            }}
          />
          {/* Pointer at the top */}
          <div className="absolute left-1/2 -top-2 -translate-x-1/2 z-20"
               style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }}>
            <div style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '22px solid #F5B62E' }} />
          </div>

          {/* Wheel disc */}
          <div
            className="absolute rounded-full overflow-hidden will-change-transform"
            style={{
              top: 14, left: 14, right: 14, bottom: 14,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 6s cubic-bezier(0.17, 0.72, 0.22, 1)' : 'none',
              boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9)',
            }}
          >
            {items.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-pulse-mute text-sm">
                Ajoute des options
              </div>
            ) : items.length === 1 ? (
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-lg"
                   style={{ background: COLORS[0] }}>
                {short(items[0], 20)}
              </div>
            ) : (
              <svg viewBox="-1 -1 2 2" className="absolute inset-0 w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
                {items.map((item, i) => {
                  const startAngle = (i / items.length) * 2 * Math.PI;
                  const endAngle = ((i + 1) / items.length) * 2 * Math.PI;
                  const largeArc = perSlice > 180 ? 1 : 0;
                  const x1 = Math.cos(startAngle), y1 = Math.sin(startAngle);
                  const x2 = Math.cos(endAngle),   y2 = Math.sin(endAngle);
                  const path = `M 0 0 L ${x1} ${y1} A 1 1 0 ${largeArc} 1 ${x2} ${y2} Z`;
                  const midAngle = (startAngle + endAngle) / 2;
                  const labelX = Math.cos(midAngle) * 0.65;
                  const labelY = Math.sin(midAngle) * 0.65;
                  return (
                    <g key={i}>
                      <path d={path} fill={COLORS[i % COLORS.length]} stroke="#00000080" strokeWidth="0.008" />
                      <text
                        x={labelX} y={labelY}
                        transform={`rotate(${(midAngle * 180) / Math.PI + 90} ${labelX} ${labelY})`}
                        fill="white"
                        fontSize="0.09"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 0.01 } as React.CSSProperties}
                      >
                        {short(item, items.length > 20 ? 8 : items.length > 12 ? 12 : 16)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Center hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
               style={{
                 width: 78, height: 78,
                 background: 'radial-gradient(circle at 30% 25%, #F5B62E 0%, #B8860B 40%, #5a4008 100%)',
                 border: '4px solid #3a2a10',
                 boxShadow: 'inset 0 -4px 10px rgba(0,0,0,0.5), inset 0 4px 8px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.6)',
               }}
          >
            <div className="text-3xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>⚡</div>
          </div>
        </div>

        {winner && !spinning && (
          <div className="mt-4 text-center bg-pulse-gold/10 border border-pulse-gold/40 rounded-xl px-4 py-3 mx-auto max-w-sm">
            <div className="text-xs uppercase text-pulse-gold/80 tracking-widest">Gagnant</div>
            <div className="text-2xl font-black text-pulse-gold multi-pulse mt-1">🎉 {winner}</div>
          </div>
        )}
      </div>

      {/* Spin button */}
      <button
        onClick={spin}
        disabled={spinning || items.length < 2}
        className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-40 shadow-brand mb-4"
      >
        {spinning ? 'La roue tourne…' : items.length < 2 ? 'Ajoute au moins 2 options' : `🎡 LANCER — ${items.length} options`}
      </button>

      {/* Items editor */}
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase text-pulse-mute">Options (une par ligne, max 40)</label>
          <div className="flex gap-2">
            <button onClick={shuffle} className="text-xs bg-pulse-border/40 px-2 py-1 rounded text-pulse-text">🔀 Mélanger</button>
            <button onClick={() => { setRawText(''); setWinner(null); }} className="text-xs bg-red-900/40 px-2 py-1 rounded text-red-200">Vider</button>
          </div>
        </div>
        <textarea
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          rows={8}
          className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm resize-y font-mono"
        />
        <div className="text-xs text-pulse-mute">{items.length} option{items.length > 1 ? 's' : ''} · max 40</div>

        <div>
          <div className="text-xs uppercase text-pulse-mute mb-2">Importer les membres</div>
          <div className="flex gap-2 flex-wrap">
            {[10, 25, 50, 100, 200].map(n => (
              <button
                key={n}
                onClick={() => importMembers(n)}
                className="text-xs bg-pulse-border/40 hover:bg-pulse-border px-3 py-1.5 rounded-lg text-pulse-text"
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Announce section — only shown after a spin */}
      {winner && !spinning && (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="accent-pulse-gold" />
            Annoncer le gagnant dans un salon Discord
          </label>

          {share && (
            <>
              <div>
                <label className="text-xs uppercase text-pulse-mute">Salon</label>
                <select value={channelId} onChange={e => setChannelId(e.target.value)} className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm">
                  {channels.map(c => <option key={c.channel_id} value={c.channel_id}># {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase text-pulse-mute">Message</label>
                <textarea
                  value={announceMsg}
                  onChange={e => setAnnounceMsg(e.target.value)}
                  rows={3}
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm resize-y"
                />
              </div>
              <button
                onClick={announce}
                disabled={status === 'sending'}
                className="w-full bg-pulse-gold text-black font-bold py-3 rounded-xl disabled:opacity-50 shadow-brand"
              >
                {status === 'sending' ? 'Envoi…' : status === 'sent' ? '✅ Annonce envoyée' : '📣 Envoyer sur Discord'}
              </button>
              {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
            </>
          )}
        </div>
      )}
    </>
  );
}
