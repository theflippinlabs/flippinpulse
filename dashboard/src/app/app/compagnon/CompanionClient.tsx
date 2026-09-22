'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AICompanion, Message } from '@/lib/aiCompanion';

const PERSONA_PRESETS: Record<string, { fr: string; en: string }> = {
  friendly:   { fr: 'chaleureux et bienveillant, comme un ami proche',   en: 'warm and caring, like a close friend' },
  witty:      { fr: 'espiègle et taquin, avec un humour vif',            en: 'playful and teasing, with a sharp sense of humor' },
  coach:      { fr: 'motivant et exigeant, comme un coach qui te pousse',en: 'motivating and demanding, like a coach pushing you' },
  scholar:    { fr: 'curieux et cultivé, adore expliquer les choses',    en: 'curious and knowledgeable, loves explaining things' },
  chill:      { fr: 'zen et cool, jamais stressé',                        en: 'zen and cool, never stressed' },
  mysterious: { fr: 'énigmatique et poétique, parle par métaphores',      en: 'enigmatic and poetic, speaks in metaphors' },
};

const EMOJI_CHOICES = ['✨', '🔮', '⚡', '🌙', '🔥', '🌊', '🌸', '💫', '🎭', '🦋'];

interface Props {
  fr: boolean;
  companion: AICompanion | null;
  initialHistory: Message[];
}

export default function CompanionClient({ fr, companion, initialHistory }: Props) {
  const [current, setCurrent] = useState<AICompanion | null>(companion);
  const [messages, setMessages] = useState<Message[]>(initialHistory);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(!companion);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(companion?.name ?? 'Nova');
  const [emoji, setEmoji] = useState(companion?.emoji ?? '✨');
  const [personaKey, setPersonaKey] = useState<keyof typeof PERSONA_PRESETS>('friendly');
  const [memory, setMemory] = useState(companion?.memory_notes ?? '');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function saveSetup() {
    setError(null);
    const persona = PERSONA_PRESETS[personaKey][fr ? 'fr' : 'en'];
    const res = await fetch('/api/compagnon/setup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, emoji, persona, memory_notes: memory, language: fr ? 'fr' : 'en', is_active: true }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'error'); return; }
    setCurrent(data.companion);
    setShowSettings(false);
  }

  async function saveMemory() {
    setError(null);
    const res = await fetch('/api/compagnon/setup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memory_notes: memory }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'error'); return; }
    setCurrent(data.companion);
  }

  async function send() {
    if (!current || pending) return;
    const text = input.trim();
    if (!text) return;
    setError(null);
    setPending(true);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    const res = await fetch('/api/compagnon/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error === 'setup_required' ? (fr ? 'Configure ton compagnon.' : 'Set up your companion.') : data.error === 'ai_not_configured' ? (fr ? 'IA non configurée sur le serveur.' : 'AI not configured on the server.') : (fr ? 'Erreur IA.' : 'AI error.'));
      return;
    }
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
  }

  async function resetHistory() {
    if (!confirm(fr ? 'Effacer tout l\'historique ?' : 'Clear the whole history?')) return;
    await fetch('/api/compagnon/reset', { method: 'POST' });
    setMessages([]);
  }

  // In settings mode we let the page scroll naturally (no fixed height) so the
  // memory textarea and Save button never end up trapped under the bottom nav.
  const wrapperClass = showSettings
    ? 'flex flex-col'
    : 'flex flex-col h-[calc(100vh-160px)]';

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold">
          <span className="text-lg leading-none">‹</span><span>{fr ? 'Retour' : 'Back'}</span>
        </Link>
        <div className="flex-1" />
        {current && (
          <>
            <button onClick={() => setShowSettings(v => !v)} className="text-xs px-3 py-1.5 rounded-full bg-pulse-card border border-pulse-border">
              ⚙️ {fr ? 'Régler' : 'Settings'}
            </button>
            <button onClick={resetHistory} className="text-xs px-3 py-1.5 rounded-full bg-pulse-card border border-pulse-border">
              🧹 {fr ? 'Vider' : 'Reset'}
            </button>
          </>
        )}
      </div>

      {current && !showSettings && (
        <div className="rounded-2xl bg-gradient-to-br from-purple-900/40 to-black border border-purple-500/40 p-3 mb-2 flex items-center gap-3">
          <div className="text-3xl">{current.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{current.name}</div>
            <div className="text-xs text-pulse-mute truncate">{current.persona}</div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="rounded-2xl bg-pulse-card border border-pulse-border p-4 mb-6 space-y-3">
          <div>
            <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Nom' : 'Name'}</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={40} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-pulse-mute uppercase tracking-wider">Emoji</label>
            <div className="flex gap-1.5 mt-1 flex-wrap">
              {EMOJI_CHOICES.map(e => (
                <button key={e} onClick={() => setEmoji(e)} className={`w-9 h-9 rounded-lg border ${emoji === e ? 'bg-pulse-gold/20 border-pulse-gold' : 'bg-black border-pulse-border'}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Personnalité' : 'Personality'}</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {Object.entries(PERSONA_PRESETS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setPersonaKey(k as keyof typeof PERSONA_PRESETS)}
                  className={`rounded-lg px-2 py-2 text-left border text-xs ${personaKey === k ? 'bg-pulse-gold/15 border-pulse-gold' : 'bg-black border-pulse-border'}`}
                >
                  {v[fr ? 'fr' : 'en']}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Mémoire long-terme (500 car. max)' : 'Long-term memory (500 chars max)'}</label>
            <textarea
              value={memory}
              onChange={e => setMemory(e.target.value.slice(0, 500))}
              rows={3}
              placeholder={fr ? 'Ce qu\'il doit retenir sur toi (goûts, prénom, projet…)' : 'What it should remember about you (interests, name, project…)'}
              className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 resize-none text-sm"
            />
            <div className="text-[10px] text-pulse-mute text-right mt-0.5">{memory.length}/500</div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveSetup} className="flex-1 rounded-lg bg-pulse-gold text-black font-bold py-2.5">
              {current ? (fr ? 'Sauvegarder' : 'Save') : (fr ? 'Créer' : 'Create')}
            </button>
            {current && (
              <button onClick={saveMemory} className="rounded-lg bg-pulse-card border border-pulse-border px-4 py-2.5 text-sm">
                {fr ? 'Mémoire seule' : 'Memory only'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">{error}</div>}

      {!showSettings && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pb-2">
            {messages.length === 0 && current && (
              <div className="text-center text-sm text-pulse-mute py-8">
                {fr ? `Dis bonjour à ${current.name} ${current.emoji}` : `Say hi to ${current.name} ${current.emoji}`}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.role === 'user' ? 'bg-pulse-gold text-black' : 'bg-pulse-card border border-pulse-border'}`}>
                  <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 bg-pulse-card border border-pulse-border">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-pulse-mute animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-pulse-mute animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-pulse-mute animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); send(); }}
            className="flex gap-2 pt-2"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={!current || pending}
              placeholder={current ? (fr ? 'Message…' : 'Message…') : (fr ? 'Configure d\'abord ton compagnon' : 'Set up your companion first')}
              className="flex-1 rounded-full bg-pulse-card border border-pulse-border px-4 py-2.5 text-sm focus:outline-none focus:border-pulse-gold"
            />
            <button
              type="submit"
              disabled={!current || pending || !input.trim()}
              className="w-10 h-10 rounded-full bg-pulse-gold text-black text-lg font-bold disabled:opacity-40"
            >
              ↑
            </button>
          </form>
        </>
      )}
    </div>
  );
}
