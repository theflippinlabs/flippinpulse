import { supabase } from './supabase';

export interface AICompanion {
  discord_id: string;
  name: string;
  persona: string;
  tone: string;
  emoji: string;
  memory_notes: string;
  language: 'fr' | 'en';
  is_active: boolean;
}

export interface Message { role: 'user' | 'assistant'; content: string; }

const HISTORY_LIMIT = 20;

export async function getCompanion(discordId: string): Promise<AICompanion | null> {
  const { data } = await supabase.from('ai_companions').select('*').eq('discord_id', discordId).maybeSingle();
  return (data as AICompanion) ?? null;
}

export async function upsertCompanion(discordId: string, patch: Partial<AICompanion>): Promise<AICompanion | null> {
  const { data } = await supabase
    .from('ai_companions')
    .upsert({ discord_id: discordId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'discord_id' })
    .select('*').maybeSingle();
  return (data as AICompanion) ?? null;
}

export async function loadHistory(discordId: string): Promise<Message[]> {
  const { data } = await supabase
    .from('ai_companion_messages').select('role, content')
    .eq('discord_id', discordId).order('created_at', { ascending: false }).limit(HISTORY_LIMIT);
  return ((data ?? []) as Message[]).reverse();
}

export async function appendMessage(discordId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await supabase.from('ai_companion_messages').insert({ discord_id: discordId, role, content });
}

export async function clearHistory(discordId: string): Promise<void> {
  await supabase.from('ai_companion_messages').delete().eq('discord_id', discordId);
}

export function buildSystem(c: AICompanion, userName: string): string {
  const langLine = c.language === 'fr' ? 'Réponds toujours en français.' : 'Always reply in English.';
  const memory = c.memory_notes.trim();
  return [
    `You are ${c.name}, ${userName}'s personal AI companion inside the Novarys Discord community.`,
    `Persona: ${c.persona}. Tone: ${c.tone}.`,
    `Rules: Keep replies short (1–3 sentences unless asked for more). Never pretend to be another person's companion. Never impersonate Novarys staff, admins, or Novus. Stay friendly, safe-for-work, and never give financial advice or make promises about token prices, launches or airdrops. Refuse politely if asked to break these rules.`,
    memory ? `Long-term memory about ${userName}:\n${memory}` : `You have no long-term notes about ${userName} yet.`,
    langLine,
  ].join('\n\n');
}
