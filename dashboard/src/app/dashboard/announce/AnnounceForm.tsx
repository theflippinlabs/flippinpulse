'use client';

import { useState } from 'react';
import ChannelPicker from '../ChannelPicker';
import type { DiscordChannel } from '@/lib/channels';

export default function AnnounceForm({ channels }: { channels: DiscordChannel[] }) {
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [embed, setEmbed] = useState(true);
  const [ping, setPing] = useState<'none' | 'everyone' | 'here'>('none');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!channelId) {
      setError('Pick a channel.');
      return;
    }
    if (!message.trim()) {
      setError('Write a message first.');
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'announce',
          payload: {
            channel_id: channelId,
            title: title.trim() || undefined,
            message: message.trim(),
            embed,
            ping: ping === 'none' ? null : ping,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('sent');
      setMessage('');
      setTitle('');
      setTimeout(() => setStatus('idle'), 4000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to queue.');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <ChannelPicker
        channels={channels}
        value={channelId}
        onChange={setChannelId}
        label="Channel"
        placeholder="Pick where to post"
      />

      <div>
        <label className="text-xs uppercase text-pulse-mute">Title (optional, embed only)</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={200}
          placeholder="e.g. Announcement"
          className="mt-1 w-full bg-pulse-card border border-pulse-border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs uppercase text-pulse-mute">Message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="Write your announcement…"
          className="mt-1 w-full bg-pulse-card border border-pulse-border rounded-lg px-3 py-2 text-sm resize-y"
        />
        <div className="text-xs text-pulse-mute mt-1">{message.length} / 4000</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={embed}
            onChange={e => setEmbed(e.target.checked)}
            className="accent-pulse-brand"
          />
          Send as embed (nicer, colored bar)
        </label>
      </div>

      <div>
        <label className="text-xs uppercase text-pulse-mute">Ping</label>
        <div className="mt-1 flex gap-2 flex-wrap">
          {(['none', 'everyone', 'here'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setPing(k)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${
                ping === k
                  ? 'bg-pulse-gold text-black border-pulse-gold'
                  : 'bg-pulse-card border-pulse-border text-pulse-mute'
              }`}
            >
              {k === 'none' ? 'No ping' : `@${k}`}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full bg-pulse-gold text-black font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {status === 'sending' ? 'Queuing…' : status === 'sent' ? '✅ Queued! Bot will post within ~15 s.' : 'Post to Discord'}
      </button>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{error}</div>
      )}
    </form>
  );
}
