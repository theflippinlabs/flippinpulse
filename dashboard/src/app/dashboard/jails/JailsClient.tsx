'use client';

import { useState } from 'react';

export interface Jail {
  discord_id: string;
  guild_id: string;
  moderator_id: string | null;
  reason: string | null;
  jailed_at: string;
  expires_at: string | null;
}

export default function JailsClient({ initial }: { initial: Jail[] }) {
  const [rows, setRows] = useState(initial);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const release = async (j: Jail) => {
    setReleasing(j.discord_id);
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'release_jail',
          payload: { discord_id: j.discord_id, guild_id: j.guild_id },
        }),
      });
      if (!res.ok) {
        const jn = await res.json().catch(() => ({}));
        throw new Error(jn.error ?? `HTTP ${res.status}`);
      }
      setRows(prev => prev.filter(x => x.discord_id !== j.discord_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setReleasing(null);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{error}</div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map(j => (
          <div key={j.discord_id + j.jailed_at} className="bg-pulse-card border border-pulse-border rounded-xl p-3">
            <div className="font-mono text-sm break-all">{j.discord_id}</div>
            <div className="text-xs text-pulse-mute mt-1">
              {new Date(j.jailed_at).toLocaleString()}
            </div>
            <div className="text-sm mt-1 line-clamp-2">{j.reason ?? '_no reason_'}</div>
            <div className="text-xs mt-1">
              {j.expires_at ? (
                <span className="text-pulse-mute">Ends {new Date(j.expires_at).toLocaleString()}</span>
              ) : (
                <span className="text-pulse-gold">⛓️ For life</span>
              )}
            </div>
            <button
              onClick={() => release(j)}
              disabled={releasing === j.discord_id}
              className="mt-3 w-full bg-emerald-500 text-black font-semibold py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {releasing === j.discord_id ? 'Releasing…' : '🔓 Release'}
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-pulse-mute text-center py-6">Nobody in jail. Peaceful.</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-pulse-card border border-pulse-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-pulse-border/40 text-pulse-mute uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-2">Inmate</th>
              <th className="text-left px-4 py-2">Jailed by</th>
              <th className="text-left px-4 py-2">Reason</th>
              <th className="text-left px-4 py-2">Jailed at</th>
              <th className="text-left px-4 py-2">Release</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(j => (
              <tr key={j.discord_id + j.jailed_at} className="border-t border-pulse-border/50">
                <td className="px-4 py-2 font-mono">{j.discord_id}</td>
                <td className="px-4 py-2 font-mono text-pulse-mute">{j.moderator_id ?? '—'}</td>
                <td className="px-4 py-2">{j.reason ?? '_no reason_'}</td>
                <td className="px-4 py-2 text-pulse-mute">{new Date(j.jailed_at).toLocaleString()}</td>
                <td className="px-4 py-2">
                  {j.expires_at
                    ? <span className="text-pulse-mute">{new Date(j.expires_at).toLocaleString()}</span>
                    : <span className="text-pulse-gold">⛓️ For life</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => release(j)}
                    disabled={releasing === j.discord_id}
                    className="px-3 py-1 rounded bg-emerald-500 text-black text-xs font-semibold disabled:opacity-50"
                  >
                    {releasing === j.discord_id ? '…' : '🔓 Release'}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-pulse-mute">Nobody in jail. Peaceful.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
