import { Message } from 'discord.js';
import { aiChat, hasAI } from './ai.js';
import { logAndAnnounce } from './moderation.js';
import { getModConfig } from './settings.js';
import { log } from '../utils/logger.js';

const inflight = new Set<string>();

interface Verdict {
  flag: boolean;
  severity: 'safe' | 'low' | 'medium' | 'high';
  category: 'harassment' | 'hate' | 'doxxing' | 'threat' | 'sexual' | 'scam' | 'spam' | 'other' | 'none';
  reason: string;
}

const SEVERITY_THRESHOLD: Record<'low' | 'medium' | 'high', 'low' | 'medium' | 'high'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

function rank(s: Verdict['severity']): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : s === 'low' ? 1 : 0;
}

function shouldAct(v: Verdict, sensitivity: 'low' | 'medium' | 'high'): boolean {
  const gate = SEVERITY_THRESHOLD[sensitivity];
  return v.flag && rank(v.severity) >= rank(gate);
}

async function classify(text: string): Promise<Verdict | null> {
  const system = 'You are a Discord community moderator. Read the message and classify it. ' +
    'Respond ONLY with a valid JSON object on a single line, no prose, no code fences. ' +
    'Shape: {"flag": boolean, "severity": "safe"|"low"|"medium"|"high", "category": "harassment"|"hate"|"doxxing"|"threat"|"sexual"|"scam"|"spam"|"other"|"none", "reason": "one short sentence"}. ' +
    'Rules: Flag only content that would violate typical Discord community guidelines — harassment aimed at a person, hate speech, doxxing (real names/addresses/phones), threats of violence, explicit sexual content, obvious scams/phishing, deliberate spam. ' +
    'Do NOT flag: profanity used casually, rude jokes between friends, criticism of ideas, gaming trash-talk, mild insults directed at situations. ' +
    'Prefer false negatives over false positives. When in doubt, mark as safe.';

  const raw = await aiChat(system, `MESSAGE:\n${text}`, 180);
  if (!raw) return null;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const v = JSON.parse(jsonMatch[0]) as Partial<Verdict>;
    return {
      flag: !!v.flag,
      severity: (['safe', 'low', 'medium', 'high'] as const).includes(v.severity as never) ? v.severity as Verdict['severity'] : 'safe',
      category: (v.category as Verdict['category']) ?? 'none',
      reason: String(v.reason ?? '').slice(0, 200),
    };
  } catch {
    return null;
  }
}

export async function runAIModCheck(message: Message): Promise<boolean> {
  if (!hasAI()) return false;
  if (!message.guild || message.author.bot || !message.member) return false;
  const cfg = getModConfig();
  if (!cfg.automod_enabled || !cfg.ai_moderation.enabled) return false;
  const content = message.content.trim();
  if (content.length < cfg.ai_moderation.min_chars) return false;
  if (inflight.has(message.id)) return false;
  inflight.add(message.id);

  try {
    const verdict = await classify(content);
    if (!verdict) return false;
    if (!shouldAct(verdict, cfg.ai_moderation.sensitivity)) return false;

    const reason = `AI mod: ${verdict.category} (${verdict.severity}) — ${verdict.reason}`;
    let actionTaken = 'flag';

    if (cfg.ai_moderation.action === 'delete' || cfg.ai_moderation.action === 'mute') {
      await message.delete().catch(() => null);
      actionTaken = 'delete';
    }
    if (cfg.ai_moderation.action === 'mute' && message.member.moderatable) {
      await message.member.timeout(cfg.ai_moderation.mute_seconds * 1000, reason).catch(err => log('ERROR', 'AI mod mute failed', err));
      actionTaken = 'mute';
    }

    await logAndAnnounce(message.guild, {
      guildId: message.guild.id,
      type: 'automod',
      targetId: message.author.id,
      reason,
      durationSeconds: actionTaken === 'mute' ? cfg.ai_moderation.mute_seconds : undefined,
      metadata: {
        trigger: 'ai_moderation',
        channel_id: message.channelId,
        ai_category: verdict.category,
        ai_severity: verdict.severity,
        action: actionTaken,
        snippet: content.slice(0, 200),
      },
    });

    return true;
  } catch (err) {
    log('ERROR', 'AI moderation failed', err);
    return false;
  } finally {
    inflight.delete(message.id);
  }
}
