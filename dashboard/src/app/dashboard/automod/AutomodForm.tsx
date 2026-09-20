'use client';

import { useState } from 'react';
import ChannelPicker from '../ChannelPicker';
import type { DiscordChannel } from '@/lib/channels';

export interface ModConfig {
  mod_log_channel_id: string | null;
  automod_enabled: boolean;
  anti_spam: { enabled: boolean; max_messages: number; window_seconds: number; mute_seconds: number };
  anti_mass_mentions: { enabled: boolean; max_mentions: number; action: 'delete' | 'warn' };
  anti_invites: { enabled: boolean; action: 'delete' | 'warn' };
  anti_links: { enabled: boolean; whitelist_domains: string[] };
  anti_raid: { enabled: boolean; max_joins: number; window_seconds: number; lockdown_minutes: number };
  auto_warn_threshold: number;
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${on ? 'bg-pulse-gold' : 'bg-pulse-border'} ${disabled ? 'opacity-50' : ''}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

interface Props { initial: ModConfig; channels: DiscordChannel[] }

export default function AutomodForm({ initial, channels }: Props) {
  const [cfg, setCfg] = useState<ModConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = async (patch: Partial<ModConfig>) => {
    setBusy(true);
    setError(null);
    const next = { ...cfg, ...patch };
    setCfg(next);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'mod_config', patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setCfg(cfg);
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string, fallback: number, min: number, max: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{error}</div>
      )}

      {/* Master toggle */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">Auto-mod is {cfg.automod_enabled ? 'ON' : 'OFF'}</div>
          <div className="text-xs text-pulse-mute mt-0.5">Master switch — all rules below only run when this is ON</div>
        </div>
        <Toggle on={cfg.automod_enabled} onClick={() => save({ automod_enabled: !cfg.automod_enabled })} disabled={busy} />
      </div>

      {/* Mod-log channel */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <ChannelPicker
          channels={channels}
          value={cfg.mod_log_channel_id ?? ''}
          onChange={id => save({ mod_log_channel_id: id || null })}
          label="Mod-log channel"
          placeholder="Where auto-mod actions are logged"
        />
      </div>

      {/* Anti-spam */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">🚫 Anti-spam</div>
            <div className="text-xs text-pulse-mute">Timeout members who flood the chat</div>
          </div>
          <Toggle on={cfg.anti_spam.enabled} onClick={() => save({ anti_spam: { ...cfg.anti_spam, enabled: !cfg.anti_spam.enabled } })} disabled={busy} />
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div>
            <label className="text-xs text-pulse-mute">Max messages</label>
            <input type="number" min={2} max={100} defaultValue={cfg.anti_spam.max_messages}
              onBlur={e => save({ anti_spam: { ...cfg.anti_spam, max_messages: num(e.target.value, cfg.anti_spam.max_messages, 2, 100) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-pulse-mute">Window (s)</label>
            <input type="number" min={1} max={300} defaultValue={cfg.anti_spam.window_seconds}
              onBlur={e => save({ anti_spam: { ...cfg.anti_spam, window_seconds: num(e.target.value, cfg.anti_spam.window_seconds, 1, 300) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-pulse-mute">Mute (s)</label>
            <input type="number" min={30} max={86400} defaultValue={cfg.anti_spam.mute_seconds}
              onBlur={e => save({ anti_spam: { ...cfg.anti_spam, mute_seconds: num(e.target.value, cfg.anti_spam.mute_seconds, 30, 86400) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
      </div>

      {/* Anti mass-mentions */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">📢 Anti mass-mentions</div>
            <div className="text-xs text-pulse-mute">Block messages that ping too many people</div>
          </div>
          <Toggle on={cfg.anti_mass_mentions.enabled} onClick={() => save({ anti_mass_mentions: { ...cfg.anti_mass_mentions, enabled: !cfg.anti_mass_mentions.enabled } })} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-pulse-mute">Max mentions</label>
            <input type="number" min={2} max={50} defaultValue={cfg.anti_mass_mentions.max_mentions}
              onBlur={e => save({ anti_mass_mentions: { ...cfg.anti_mass_mentions, max_mentions: num(e.target.value, cfg.anti_mass_mentions.max_mentions, 2, 50) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-pulse-mute">Action</label>
            <select defaultValue={cfg.anti_mass_mentions.action}
              onChange={e => save({ anti_mass_mentions: { ...cfg.anti_mass_mentions, action: e.target.value as 'delete' | 'warn' } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm">
              <option value="delete">Delete</option>
              <option value="warn">Warn</option>
            </select>
          </div>
        </div>
      </div>

      {/* Anti-invites */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">🔗 Anti-invites</div>
            <div className="text-xs text-pulse-mute">Block Discord invite links from other servers</div>
          </div>
          <Toggle on={cfg.anti_invites.enabled} onClick={() => save({ anti_invites: { ...cfg.anti_invites, enabled: !cfg.anti_invites.enabled } })} disabled={busy} />
        </div>
        <div>
          <label className="text-xs text-pulse-mute">Action</label>
          <select defaultValue={cfg.anti_invites.action}
            onChange={e => save({ anti_invites: { ...cfg.anti_invites, action: e.target.value as 'delete' | 'warn' } })}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm">
            <option value="delete">Delete</option>
            <option value="warn">Warn</option>
          </select>
        </div>
      </div>

      {/* Anti-links */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">🌐 Anti-links</div>
            <div className="text-xs text-pulse-mute">Delete external links unless whitelisted</div>
          </div>
          <Toggle on={cfg.anti_links.enabled} onClick={() => save({ anti_links: { ...cfg.anti_links, enabled: !cfg.anti_links.enabled } })} disabled={busy} />
        </div>
        <div>
          <label className="text-xs text-pulse-mute">Whitelisted domains (comma-separated)</label>
          <input defaultValue={cfg.anti_links.whitelist_domains.join(', ')}
            onBlur={e => save({ anti_links: { ...cfg.anti_links, whitelist_domains: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
            placeholder="youtube.com, tenor.com"
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
        </div>
      </div>

      {/* Anti-raid */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">🛡️ Anti-raid</div>
            <div className="text-xs text-pulse-mute">Auto-lockdown if too many members join at once</div>
          </div>
          <Toggle on={cfg.anti_raid.enabled} onClick={() => save({ anti_raid: { ...cfg.anti_raid, enabled: !cfg.anti_raid.enabled } })} disabled={busy} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-pulse-mute">Max joins</label>
            <input type="number" min={2} max={100} defaultValue={cfg.anti_raid.max_joins}
              onBlur={e => save({ anti_raid: { ...cfg.anti_raid, max_joins: num(e.target.value, cfg.anti_raid.max_joins, 2, 100) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-pulse-mute">Window (s)</label>
            <input type="number" min={5} max={600} defaultValue={cfg.anti_raid.window_seconds}
              onBlur={e => save({ anti_raid: { ...cfg.anti_raid, window_seconds: num(e.target.value, cfg.anti_raid.window_seconds, 5, 600) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-pulse-mute">Lockdown (min)</label>
            <input type="number" min={1} max={240} defaultValue={cfg.anti_raid.lockdown_minutes}
              onBlur={e => save({ anti_raid: { ...cfg.anti_raid, lockdown_minutes: num(e.target.value, cfg.anti_raid.lockdown_minutes, 1, 240) } })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>
      </div>

      {/* Auto-warn threshold */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <div className="font-semibold">⚠️ Auto-warn threshold</div>
        <div className="text-xs text-pulse-mute mb-2">Warnings before member is auto-muted</div>
        <input type="number" min={1} max={10} defaultValue={cfg.auto_warn_threshold}
          onBlur={e => save({ auto_warn_threshold: num(e.target.value, cfg.auto_warn_threshold, 1, 10) })}
          className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1.5 text-sm" />
      </div>

      {savedAt && !error && (
        <div className="text-xs text-pulse-mute text-center">Saved just now.</div>
      )}
    </div>
  );
}
