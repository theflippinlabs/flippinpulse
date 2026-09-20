'use client';

import { useEffect, useRef, useState } from 'react';
import { useT, useLocale, tArray } from '@/lib/i18n-client';

interface Message { role: 'user' | 'assistant'; content: string }

interface SpeechRecogEvent { results: { [k: number]: { [k: number]: { transcript: string }, isFinal: boolean } }; resultIndex: number }
interface SpeechRecog {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecogEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

export default function NovusClient() {
  const t = useT();
  const locale = useLocale();
  const suggestions = tArray(locale, 'novus.suggestions');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recogRef = useRef<SpeechRecog | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecog;
      webkitSpeechRecognition?: new () => SpeechRecog;
    };
    setVoiceSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const next: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    try {
      const res = await fetch('/api/ai/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'novus', messages: next, locale }),
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

  const toggleVoice = () => {
    if (listening) { recogRef.current?.stop(); return; }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecog;
      webkitSpeechRecognition?: new () => SpeechRecog;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recog = new Ctor();
    recog.lang = locale === 'en' ? 'en-US' : 'fr-FR';
    recog.continuous = false;
    recog.interimResults = true;
    let finalSoFar = '';
    recog.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalSoFar += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput(finalSoFar + interim);
    };
    recog.onerror = e => { setError(`Voice error: ${e.error}`); setListening(false); };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    setListening(true);
    try { recog.start(); } catch (err) { setError(String(err)); setListening(false); }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 240px)' }}>
      <div className="flex-1 space-y-3 mb-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="text-6xl mb-3">🧠</div>
            <div className="text-pulse-mute text-sm mb-4">{t('novus.empty')}</div>
            <div className="grid grid-cols-1 gap-2 max-w-md mx-auto">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-3 py-2 rounded-lg bg-pulse-card border border-pulse-border hover:border-pulse-gold/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-pulse-gold text-black font-medium rounded-br-sm'
                : 'bg-pulse-card border border-pulse-border rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-pulse-card border border-pulse-border rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-pulse-mute">
              <span className="inline-block animate-pulse">🧠 {t('novus.thinking')}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-24 bg-black/95 backdrop-blur border-t border-pulse-border -mx-4 px-4 py-3 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={listening ? `🎤 ${t('novus.voice_listening')}` : t('novus.placeholder')}
          rows={2}
          className="flex-1 bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm resize-none"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? t('novus.voice_stop') : t('novus.voice_start')}
            className={`w-11 h-11 rounded-lg font-bold flex items-center justify-center text-lg ${
              listening ? 'bg-red-500 text-white animate-pulse' : 'bg-pulse-border/60 text-pulse-text'
            }`}
          >
            🎤
          </button>
        )}
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="px-4 py-2 rounded-lg bg-pulse-gold text-black font-bold text-sm disabled:opacity-50"
        >
          {busy ? '…' : t('common.send')}
        </button>
      </div>
    </div>
  );
}
