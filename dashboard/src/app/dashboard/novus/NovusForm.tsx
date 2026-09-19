'use client';

import { useState } from 'react';

export interface PulsarConfig {
  enabled: boolean;
  channel_id: string | null;
  language: string;
  interval_hours: number;
  tag_active_members: boolean;
  reply_to_mentions: boolean;
  welcome: boolean;
  host_events: boolean;
  celebrate: boolean;
  recap: boolean;
  recap_time_utc: string;
  missions: boolean;
  mission_interval_hours: number;
}

interface Props { initial: PulsarConfig }

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

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-pulse-border/60 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <div className="text-xs text-pulse-mute mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function NovusForm({ initial }: Props) {
  const [cfg, setCfg] = useState<PulsarConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [postStatus, setPostStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Partial<PulsarConfig>) => {
    setBusy(true);
    setError(null);
    setCfg(prev => ({ ...prev, ...patch }));
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'pulsar_config', patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      // Revert optimistic UI
      setCfg(prev => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map(k => [k, initial[k as keyof PulsarConfig]])) as unknown as Partial<PulsarConfig> }));
    } finally {
      setBusy(false);
    }
  };

  const postNow = async () => {
    setPostStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: 'novus_post_now', payload: {} }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setPostStatus('sent');
      setTimeout(() => setPostStatus('idle'), 4000);
    } catch (err) {
      setPostStatus('error');
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{error}</div>
      )}

      {/* Master toggle */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <Row label="Novus is active" hint={cfg.enabled ? 'Posting to your Discord community' : 'Off — no automatic posts'}>
          <Toggle on={cfg.enabled} onClick={() => save({ enabled: !cfg.enabled })} disabled={busy} />
        </Row>
      </div>

      {/* Channel + language + cadence */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <div>
          <label className="text-xs uppercase text-pulse-mute">Channel ID</label>
          <input
            defaultValue={cfg.channel_id ?? ''}
            onBlur={e => save({ channel_id: e.target.value.trim() || null })}
            placeholder="Where Novus posts"
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 font-mono text-sm"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase text-pulse-mute">Language</label>
            <input
              defaultValue={cfg.language}
              onBlur={e => save({ language: e.target.value.trim() || 'English' })}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-pulse-mute">Post every (hours)</label>
            <input
              type="number"
              step="0.5"
              min={0.5}
              max={24}
              defaultValue={cfg.interval_hours}
              onBlur={e => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0.5 && n <= 24) save({ interval_hours: n });
              }}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs uppercase text-pulse-mute">Daily recap time (UTC HH:MM)</label>
          <input
            defaultValue={cfg.recap_time_utc}
            onBlur={e => {
              const v = e.target.value.trim();
              if (/^\d{1,2}:\d{2}$/.test(v)) save({ recap_time_utc: v });
            }}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Behavior toggles */}
      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <Row label="Reply to mentions" hint="Novus answers when tagged"><Toggle on={cfg.reply_to_mentions} onClick={() => save({ reply_to_mentions: !cfg.reply_to_mentions })} disabled={busy} /></Row>
        <Row label="Tag active members" hint="Nudge people who chatted recently"><Toggle on={cfg.tag_active_members} onClick={() => save({ tag_active_members: !cfg.tag_active_members })} disabled={busy} /></Row>
        <Row label="Welcome newcomers"><Toggle on={cfg.welcome} onClick={() => save({ welcome: !cfg.welcome })} disabled={busy} /></Row>
        <Row label="Host events"><Toggle on={cfg.host_events} onClick={() => save({ host_events: !cfg.host_events })} disabled={busy} /></Row>
        <Row label="Celebrate wins" hint="Rank-ups, jackpots, milestones"><Toggle on={cfg.celebrate} onClick={() => save({ celebrate: !cfg.celebrate })} disabled={busy} /></Row>
        <Row label="Daily recap"><Toggle on={cfg.recap} onClick={() => save({ recap: !cfg.recap })} disabled={busy} /></Row>
        <Row label="Auto-launch missions"><Toggle on={cfg.missions} onClick={() => save({ missions: !cfg.missions })} disabled={busy} /></Row>
      </div>

      <button
        onClick={postNow}
        disabled={postStatus === 'sending' || !cfg.enabled || !cfg.channel_id}
        className="w-full bg-pulse-gold text-black font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {postStatus === 'sending' ? 'Posting…' : postStatus === 'sent' ? '✅ Posted' : '🧠 Post now'}
      </button>
      {(!cfg.enabled || !cfg.channel_id) && (
        <div className="text-xs text-pulse-mute text-center">
          Turn Novus ON and set a channel to enable Post now.
        </div>
      )}
      {savedAt && !error && (
        <div className="text-xs text-pulse-mute text-center">Saved just now.</div>
      )}
    </div>
  );
}
