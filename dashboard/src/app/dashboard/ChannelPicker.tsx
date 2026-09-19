'use client';

import { useMemo, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

interface Props {
  channels: DiscordChannel[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
}

export default function ChannelPicker({
  channels,
  value,
  onChange,
  label = 'Channel',
  placeholder = 'Pick a channel',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => channels.find(c => c.channel_id === value), [channels, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(c => !q || c.name.toLowerCase().includes(q));
  }, [channels, query]);

  return (
    <div>
      <label className="text-xs uppercase text-pulse-mute">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full flex items-center justify-between bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm text-left"
      >
        <span className={selected ? 'text-pulse-text' : 'text-pulse-mute'}>
          {selected ? `# ${selected.name}` : placeholder}
        </span>
        <span className="text-pulse-mute">›</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-pulse-card border border-pulse-border rounded-t-2xl md:rounded-2xl max-h-[75vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-pulse-border">
              <div className="font-bold">Pick a channel</div>
              <button onClick={() => setOpen(false)} className="text-pulse-mute text-xl leading-none">✕</button>
            </div>
            <div className="p-3 border-b border-pulse-border">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="p-6 text-center text-sm text-pulse-mute">
                  {channels.length === 0
                    ? 'The bot has not synced its channel list yet. Wait ~5 min after the bot boots.'
                    : 'No channel matches.'}
                </div>
              )}
              {filtered.map(c => {
                const active = c.channel_id === value;
                return (
                  <button
                    key={c.channel_id}
                    onClick={() => { onChange(c.channel_id); setOpen(false); }}
                    className={`w-full text-left px-4 py-3 border-b border-pulse-border/60 last:border-b-0 flex items-center justify-between ${
                      active ? 'bg-pulse-gold/10 text-pulse-gold' : 'hover:bg-pulse-border/30'
                    }`}
                  >
                    <span className="truncate">
                      <span className="text-pulse-mute">#</span> {c.name}
                    </span>
                    {active && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
