'use client';

import { useState } from 'react';

type Kind = 'announce' | 'tournament' | 'mission' | 'free';

interface Message { role: 'user' | 'assistant'; content: string }

interface Props {
  kind: Kind;
  // Where to send the "Use this" text. Called with the final assistant text
  // when the user picks Insert. If not provided, only a copy button shows.
  onInsert?: (text: string) => void;
  // Optional pre-seed: what's already in the target field, so the AI can
  // improve rather than rewrite from scratch.
  seed?: string;
  buttonLabel?: string;
}

export default function AIWriter({ kind, onInsert, seed, buttonLabel = '✨ Aide-moi à rédiger' }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDrawer = () => {
    setOpen(true);
    // Seed the conversation with a friendly system-shaped opener.
    if (!messages.length) {
      const opener = seed
        ? `J'ai déjà ce brouillon, améliore-le :\n\n${seed}`
        : opening[kind];
      setInput(opener);
    }
  };

  const close = () => setOpen(false);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const nextMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    try {
      const res = await fetch('/api/ai/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setInput(seed ? `Améliore ce brouillon :\n\n${seed}` : opening[kind]);
    setError(null);
  };

  const lastReply = [...messages].reverse().find(m => m.role === 'assistant')?.content;

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-md hover:opacity-90"
      >
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-6" onClick={close}>
          <div
            className="w-full md:max-w-xl bg-pulse-card border border-pulse-border rounded-t-2xl md:rounded-2xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-pulse-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-lg">✨</div>
                <div>
                  <div className="font-bold text-sm">Assistant Novarys</div>
                  <div className="text-[10px] text-pulse-mute uppercase tracking-wide">{labels[kind]}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clear} className="text-xs text-pulse-mute hover:text-pulse-gold">Reset</button>
                <button onClick={close} className="text-pulse-mute text-2xl">✕</button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8 text-pulse-mute text-sm">
                  Décris ce que tu veux écrire ci-dessous et je te le rédige.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-pulse-gold text-black font-medium'
                      : 'bg-pulse-bg border border-pulse-border text-pulse-text'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-pulse-bg border border-pulse-border rounded-xl px-3 py-2 text-sm text-pulse-mute">
                    <span className="inline-block animate-pulse">✨ rédige…</span>
                  </div>
                </div>
              )}
              {error && (
                <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">
                  {error}
                </div>
              )}
            </div>

            {/* Last-reply actions */}
            {lastReply && !busy && (
              <div className="px-3 py-2 border-t border-pulse-border flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(lastReply)}
                  className="flex-1 py-2 rounded-lg bg-pulse-border/40 text-xs text-pulse-text font-semibold"
                >
                  📋 Copier
                </button>
                {onInsert && (
                  <button
                    onClick={() => { onInsert(lastReply); close(); }}
                    className="flex-1 py-2 rounded-lg bg-pulse-gold text-black text-xs font-bold shadow-brand"
                  >
                    ✅ Utiliser ce texte
                  </button>
                )}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-pulse-border flex gap-2 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
                }}
                placeholder="Explique ce que tu veux…"
                rows={2}
                className="flex-1 bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="px-4 py-2 rounded-lg bg-pulse-gold text-black font-bold text-sm disabled:opacity-50"
              >
                {busy ? '…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const labels: Record<Kind, string> = {
  announce:   'Annonce',
  tournament: 'Tournoi',
  mission:    'Mission',
  free:       'Rédaction libre',
};

const opening: Record<Kind, string> = {
  announce:   'Écris une annonce pour prévenir les membres qu\'un événement arrive ce soir à 20h.',
  tournament: 'Propose un titre + une description pour un tournoi de blackjack cette semaine.',
  mission:    'Rédige une mission daily : envoyer 20 messages avec 60 PULSE de récompense.',
  free:       'Aide-moi à formuler quelque chose de percutant.',
};
