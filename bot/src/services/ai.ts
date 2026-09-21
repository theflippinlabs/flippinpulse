import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger.js';

const MODEL = process.env.AI_MODEL || process.env.PULSAR_MODEL || process.env.AI_QUIZ_MODEL || 'claude-sonnet-4-6';

export function hasAI(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function aiChat(
  system: string,
  userText: string | Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens = 400,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const messages = Array.isArray(userText)
      ? userText.map(m => ({ role: m.role, content: m.content }))
      : [{ role: 'user' as const, content: userText }];
    const res = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim();
    return text || null;
  } catch (err) {
    log('ERROR', 'AI call failed', err);
    return null;
  }
}
