'use client';

import { useState } from 'react';

export interface GameData {
  game_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
  label: string;
  emoji: string;
}

interface Field {
  key: string;
  label: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

// Common fields shown for every game.
const COMMON: Field[] = [
  { key: 'min_bet',          label: 'Min bet',          hint: 'Lowest PULSE per play', min: 0, max: 1_000_000, suffix: 'PULSE' },
  { key: 'max_bet',          label: 'Max bet',          hint: 'Highest PULSE per play', min: 0, max: 10_000_000, suffix: 'PULSE' },
  { key: 'fee_percent',      label: 'House edge',       hint: 'Higher = players win less often', min: 0, max: 100, suffix: '%' },
  { key: 'cooldown_seconds', label: 'Cooldown',         hint: 'Seconds between plays per member', min: 0, max: 86400, suffix: 's' },
];

// Extra per-game fields.
const EXTRA: Record<string, Field[]> = {
  crash: [
    { key: 'crash_min', label: 'Crash floor',   hint: 'Lowest possible crash multiplier', min: 1, max: 100, step: 0.1, suffix: 'x' },
    { key: 'crash_max', label: 'Crash ceiling', hint: 'Highest possible crash multiplier', min: 1, max: 1000, step: 0.1, suffix: 'x' },
  ],
  slots: [
    { key: 'payouts.three_seven',   label: 'Payout 3x 7️⃣',   hint: 'Multiplier when 3 sevens align',   min: 1, max: 500, suffix: 'x' },
    { key: 'payouts.three_diamond', label: 'Payout 3x 💎',    hint: 'Multiplier when 3 diamonds align', min: 1, max: 500, suffix: 'x' },
    { key: 'payouts.three_star',    label: 'Payout 3x ⭐',    hint: 'Multiplier when 3 stars align',    min: 1, max: 500, suffix: 'x' },
    { key: 'payouts.three_other',   label: 'Payout 3x other', hint: 'Multiplier for any 3 matching',     min: 1, max: 500, suffix: 'x' },
    { key: 'payouts.two_match',     label: 'Payout 2 match',  hint: 'Multiplier for 2 matching',         min: 0, max: 500, suffix: 'x' },
  ],
  blackjack: [
    { key: 'blackjack_payout_num', label: 'Blackjack payout numerator',   hint: 'Default 3',  min: 1, max: 10 },
    { key: 'blackjack_payout_den', label: 'Blackjack payout denominator', hint: 'Default 2 (3:2 payout)', min: 1, max: 10 },
    { key: 'dealer_stand_min',     label: 'Dealer stands at',             hint: 'Default 17', min: 12, max: 21 },
  ],
  roulette: [
    { key: 'even_money_payout',    label: 'Even money payout',    hint: 'Red/Black/Odd/Even multiplier (default 2)', min: 1, max: 5 },
    { key: 'single_number_payout', label: 'Single number payout', hint: 'Straight up multiplier (default 36)',       min: 1, max: 36 },
  ],
  battle_royale: [
    { key: 'fixed_reward',         label: 'Winner reward',        hint: 'Extra PULSE the last standing gets', min: 0, max: 10_000, suffix: 'PULSE' },
    { key: 'max_players',          label: 'Max players',          min: 2, max: 50 },
    { key: 'min_players',          label: 'Min players',          min: 2, max: 50 },
    { key: 'join_timeout_seconds', label: 'Join timeout',         min: 5, max: 300, suffix: 's' },
  ],
  dice_royale: [
    { key: 'fixed_reward',         label: 'Winner reward',        min: 0, max: 10_000, suffix: 'PULSE' },
    { key: 'max_players',          label: 'Max players',          min: 2, max: 50 },
    { key: 'join_timeout_seconds', label: 'Join timeout',         min: 5, max: 300, suffix: 's' },
  ],
  chicken_race: [
    { key: 'default_buy_in', label: 'Default buy-in',    hint: 'Default bet if none passed', min: 1, max: 10_000, suffix: 'PULSE' },
    { key: 'max_players',    label: 'Max players',       min: 2, max: 50 },
    { key: 'wait_seconds',   label: 'Lobby wait',        min: 5, max: 120, suffix: 's' },
  ],
  quiz: [
    { key: 'questions_per_round',      label: 'Questions per round',       min: 1, max: 30 },
    { key: 'time_per_question_seconds', label: 'Seconds per question',     min: 5, max: 120, suffix: 's' },
  ],
  typing_race: [
    { key: 'fixed_reward',         label: 'Winner reward',        min: 0, max: 5000, suffix: 'PULSE' },
    { key: 'max_players',          label: 'Max players',          min: 2, max: 50 },
    { key: 'join_timeout_seconds', label: 'Join timeout',         min: 5, max: 300, suffix: 's' },
  ],
  duel: [
    { key: 'timeout_seconds', label: 'Duel timeout', min: 10, max: 300, suffix: 's' },
  ],
  rps: [
    { key: 'timeout_seconds', label: 'RPS timeout', min: 10, max: 300, suffix: 's' },
  ],
  higherlower: [
    { key: 'max_rounds', label: 'Max rounds', min: 1, max: 30 },
  ],
};

function readNested(obj: Record<string, unknown>, key: string): number | undefined {
  const parts = key.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'number' ? cur : undefined;
}

function setNested(obj: Record<string, unknown>, key: string, value: number): Record<string, unknown> {
  const parts = key.split('.');
  const next = { ...obj };
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const child = cur[p];
    const branch = typeof child === 'object' && child !== null ? { ...(child as Record<string, unknown>) } : {};
    cur[p] = branch;
    cur = branch;
  }
  cur[parts[parts.length - 1]] = value;
  return next;
}

export default function GameDetailClient({ initial }: { initial: GameData }) {
  const [config, setConfig] = useState<Record<string, unknown>>(initial.config_json ?? {});
  const [enabled, setEnabled] = useState(initial.is_enabled);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patchConfig = async (key: string, value: number) => {
    setBusy(true);
    setError(null);
    const nextCfg = setNested(config, key, value);
    setConfig(nextCfg);
    try {
      const patch: Record<string, unknown> = {};
      if (key.includes('.')) {
        // Send full sub-object (bot merges shallowly).
        const root = key.split('.')[0];
        patch[root] = (nextCfg as Record<string, unknown>)[root];
      } else {
        patch[key] = value;
      }
      const res = await fetch('/api/games/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game_key: initial.game_key, patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setConfig(config); // revert
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    setBusy(true);
    setError(null);
    const next = !enabled;
    setEnabled(next);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game_key: initial.game_key, enabled: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setEnabled(enabled);
    } finally {
      setBusy(false);
    }
  };

  const extras = EXTRA[initial.game_key] ?? [];

  const FieldRow = ({ f }: { f: Field }) => {
    const val = readNested(config, f.key) ?? 0;
    return (
      <div className="py-3 border-b border-pulse-border/60 last:border-b-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <label className="text-sm font-semibold">{f.label}</label>
          {f.suffix && <span className="text-xs text-pulse-mute">{f.suffix}</span>}
        </div>
        {f.hint && <div className="text-xs text-pulse-mute mb-2">{f.hint}</div>}
        <input
          type="number"
          inputMode="decimal"
          step={f.step ?? 1}
          min={f.min}
          max={f.max}
          defaultValue={val}
          onBlur={e => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            const clamped = Math.min(f.max ?? 1_000_000_000, Math.max(f.min ?? 0, n));
            patchConfig(f.key, clamped);
          }}
          className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{error}</div>
      )}

      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Game is {enabled ? 'ON' : 'OFF'}</div>
            <div className="text-xs text-pulse-mute mt-0.5">Members can{enabled ? '' : "'t"} play right now</div>
          </div>
          <button
            onClick={toggleEnabled}
            disabled={busy}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              enabled ? 'bg-pulse-gold' : 'bg-pulse-border'
            }`}
          >
            <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
        <div className="text-xs uppercase tracking-wide text-pulse-mute mb-2">Common settings</div>
        {COMMON.map(f => <FieldRow key={f.key} f={f} />)}
      </div>

      {extras.length > 0 && (
        <div className="bg-pulse-card border border-pulse-border rounded-2xl p-4">
          <div className="text-xs uppercase tracking-wide text-pulse-gold/70 mb-2">{initial.label} specifics</div>
          {extras.map(f => <FieldRow key={f.key} f={f} />)}
        </div>
      )}

      {savedAt && !error && (
        <div className="text-xs text-pulse-mute text-center">Saved just now — the bot uses the new values on the next play.</div>
      )}
    </div>
  );
}
