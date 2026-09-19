'use client';

import { useState } from 'react';
import ChannelPicker from '../ChannelPicker';
import type { DiscordChannel } from '@/lib/channels';

interface Props {
  channels: DiscordChannel[];
  potPulse: number;
  ticketPrice: number;
  drawAt: string | null;
  defaultChannelId: string | null;
}

export default function LotteryActions({ channels, potPulse, ticketPrice, drawAt, defaultChannelId }: Props) {
  const [channelId, setChannelId] = useState(defaultChannelId ?? '');
  const [ping, setPing] = useState<'everyone' | 'none'>('everyone');
  const [status, setStatus] = useState<'idle' | 'announcing' | 'drawing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const announce = async () => {
    if (!channelId) { setError('Pick a channel first.'); return; }
    setStatus('announcing');
    setError(null);
    try {
      const drawTs = drawAt ? Math.floor(new Date(drawAt).getTime() / 1000) : null;
      const message =
        `🎰 **Lottery jackpot: ${potPulse.toLocaleString('en-US')} PULSE!** 💰\n\n` +
        `🎟️ Tickets: **${ticketPrice} PULSE** each — buy in with \`/lottery buy\`.\n` +
        (drawTs ? `⏰ Next draw: <t:${drawTs}:R>\n\n` : '\n') +
        `The more tickets you hold, the better your odds. Good luck! 🍀`;
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'announce',
          payload: {
            channel_id: channelId,
            title: '🎰 Lottery Jackpot',
            message,
            embed: true,
            ping: ping === 'everyone' ? 'everyone' : null,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  const forceDraw = async () => {
    if (!confirm('Draw the lottery right now? A winner will be picked from current tickets.')) return;
    setStatus('drawing');
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'force_lottery_draw', payload: {} }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('done');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  return (
    <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 mb-6 space-y-3">
      <div className="font-semibold">Actions</div>
      {error && (
        <div className="p-2.5 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>
      )}

      <ChannelPicker
        channels={channels}
        value={channelId}
        onChange={setChannelId}
        label="Channel to announce in"
        placeholder="Pick a channel"
      />

      <div>
        <label className="text-xs uppercase text-pulse-mute">Ping</label>
        <div className="mt-1 flex gap-2">
          {(['none', 'everyone'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setPing(k)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${
                ping === k ? 'bg-pulse-gold text-black border-pulse-gold' : 'bg-pulse-bg border-pulse-border text-pulse-mute'
              }`}
            >
              {k === 'none' ? 'Silent' : '@everyone'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={announce}
          disabled={status === 'announcing' || status === 'drawing'}
          className="bg-pulse-gold text-black font-semibold py-3 rounded-lg disabled:opacity-50"
        >
          {status === 'announcing' ? 'Sending…' : '📣 Announce jackpot'}
        </button>
        <button
          onClick={forceDraw}
          disabled={status === 'drawing' || status === 'announcing'}
          className="bg-red-500/90 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
        >
          {status === 'drawing' ? 'Drawing…' : '🎯 Force draw now'}
        </button>
      </div>
      {status === 'done' && (
        <div className="text-xs text-emerald-400">✅ Done — the bot is running it in Discord.</div>
      )}
    </div>
  );
}
