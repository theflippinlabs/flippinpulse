'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface GuildOption {
  id: string;
  name: string;
  icon: string | null;
  installed: boolean;
}

interface Props {
  guilds: GuildOption[];
  activeGuildId: string | null;
  installUrlBase: string | null;
}

function iconUrl(g: GuildOption): string | null {
  if (!g.icon) return null;
  const ext = g.icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}?size=64`;
}

/**
 * Dropdown that lists every guild the Lord can admin, with a visual flag
 * showing which already have Novarys installed. Picking a guild sets the
 * `novarys_guild` cookie via /api/guild/switch, then reloads to re-render
 * every page component with the new scope. Guilds without the bot get an
 * inline "Install Novarys" shortcut that preselects the guild on Discord's
 * install screen so the Lord doesn't have to pick it again.
 */
export default function GuildSwitcher({ guilds, activeGuildId, installUrlBase }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (guilds.length === 0) return null;
  const active = guilds.find(g => g.id === activeGuildId) ?? guilds[0];

  async function pick(g: GuildOption) {
    if (g.id === activeGuildId) { setOpen(false); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/guild/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guildId: g.id }),
      });
      if (res.ok) {
        router.refresh();
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function installFor(g: GuildOption) {
    if (!installUrlBase) return;
    const url = new URL(installUrlBase);
    url.searchParams.set('guild_id', g.id);
    url.searchParams.set('disable_guild_select', 'true');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-pulse-card border border-pulse-border hover:border-pulse-gold/40 text-left"
      >
        {iconUrl(active)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={iconUrl(active)!} alt="" className="w-6 h-6 rounded-full" />
          : <div className="w-6 h-6 rounded-full bg-pulse-border flex items-center justify-center text-[10px] font-bold">{active.name.slice(0, 1).toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-pulse-mute uppercase tracking-wider">Server</div>
          <div className="text-sm font-semibold truncate">{active.name}</div>
        </div>
        <span className="text-xs text-pulse-mute">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-2 max-h-80 overflow-y-auto rounded-lg bg-pulse-card border border-pulse-border shadow-xl z-50">
          {guilds.map(g => (
            <div key={g.id} className="px-2 py-1.5 border-b border-pulse-border/40 last:border-b-0">
              <button
                onClick={() => pick(g)}
                disabled={busy || !g.installed}
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded ${
                  g.id === activeGuildId ? 'bg-pulse-gold/10' : 'hover:bg-pulse-border/40'
                } ${!g.installed ? 'opacity-60' : ''}`}
                title={g.installed ? g.name : 'Novarys is not installed on this server yet'}
              >
                {iconUrl(g)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={iconUrl(g)!} alt="" className="w-6 h-6 rounded-full" />
                  : <div className="w-6 h-6 rounded-full bg-pulse-border flex items-center justify-center text-[10px] font-bold">{g.name.slice(0, 1).toUpperCase()}</div>}
                <span className="flex-1 text-sm truncate">{g.name}</span>
                <span className="text-[10px] text-pulse-mute shrink-0">{g.installed ? '🤖' : '○'}</span>
              </button>
              {!g.installed && installUrlBase && (
                <button
                  onClick={() => installFor(g)}
                  className="w-full mt-1 text-[11px] px-2 py-1 rounded bg-pulse-gold/15 border border-pulse-gold/30 text-pulse-gold font-semibold"
                >
                  ➕ Install Novarys here
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
