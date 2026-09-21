import { supabase } from '../supabase.js';
import { aiChat, hasAI } from './ai.js';
import { log } from '../utils/logger.js';

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

interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
}

const HISTORY_LIMIT = 20;

export async function getCompanion(discordId: string): Promise<AICompanion | null> {
  const { data, error } = await supabase
    .from('ai_companions')
    .select('*')
    .eq('discord_id', discordId)
    .maybeSingle();
  if (error) { log('ERROR', 'getCompanion failed', error); return null; }
  return (data as AICompanion) ?? null;
}

export async function upsertCompanion(patch: Partial<AICompanion> & { discord_id: string }): Promise<AICompanion | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_companions')
    .upsert({ ...patch, updated_at: now }, { onConflict: 'discord_id' })
    .select('*')
    .maybeSingle();
  if (error) { log('ERROR', 'upsertCompanion failed', error); return null; }
  return (data as AICompanion) ?? null;
}

export async function deleteCompanion(discordId: string): Promise<boolean> {
  const { error } = await supabase.from('ai_companions').delete().eq('discord_id', discordId);
  if (error) { log('ERROR', 'deleteCompanion failed', error); return false; }
  return true;
}

async function loadHistory(discordId: string): Promise<CompanionMessage[]> {
  const { data } = await supabase
    .from('ai_companion_messages')
    .select('role, content')
    .eq('discord_id', discordId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (data ?? []) as CompanionMessage[];
  return rows.reverse();
}

async function appendMessage(discordId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  await supabase.from('ai_companion_messages').insert({ discord_id: discordId, role, content });
}

function buildSystem(c: AICompanion, userName: string): string {
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

export async function chatWithCompanion(discordId: string, userName: string, userText: string): Promise<{ reply: string | null; setupRequired: boolean }> {
  if (!hasAI()) return { reply: null, setupRequired: false };
  const companion = await getCompanion(discordId);
  if (!companion || !companion.is_active) return { reply: null, setupRequired: true };

  const history = await loadHistory(discordId);
  const messages: CompanionMessage[] = [...history, { role: 'user', content: userText.slice(0, 2000) }];

  const reply = await aiChat(buildSystem(companion, userName), messages, 400);
  if (!reply) return { reply: null, setupRequired: false };

  await appendMessage(discordId, 'user', userText.slice(0, 2000));
  await appendMessage(discordId, 'assistant', reply);
  return { reply, setupRequired: false };
}

export async function clearHistory(discordId: string): Promise<void> {
  await supabase.from('ai_companion_messages').delete().eq('discord_id', discordId);
}
