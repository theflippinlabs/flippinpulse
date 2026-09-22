import { Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { earnPulse } from './games.js';
import { getWelcomeConfig } from './settings.js';
import { log } from '../utils/logger.js';

export interface Chapter {
  day: number;           // 1-indexed day within the saga
  title: string;
  clue: string;
  answer: string;        // normalized when stored
  reward_pulse: number;  // per-chapter reward
}

export interface Saga {
  id: number;
  title: string;
  intro: string;
  starts_at: string;
  ends_at: string;
  reward_pulse: number;      // final completion bonus
  created_by: string;
  status: 'scheduled' | 'running' | 'ended' | 'cancelled';
  chapters_json: Chapter[];
  created_at: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
}

export async function createSaga(input: {
  title: string; intro: string; startsAt: Date; days: number; rewardPulse: number;
  chapters: { title: string; clue: string; answer: string; reward: number; }[];
  createdBy: string;
}): Promise<{ ok: boolean; error?: string; saga?: Saga }> {
  if (input.chapters.length !== input.days) return { ok: false, error: 'chapters_days_mismatch' };
  const chapters: Chapter[] = input.chapters.map((c, i) => ({
    day: i + 1,
    title: c.title.slice(0, 80),
    clue: c.clue.slice(0, 400),
    answer: normalize(c.answer),
    reward_pulse: Math.max(1, Math.floor(c.reward)),
  }));
  const endsAt = new Date(input.startsAt.getTime() + input.days * 86_400_000);
  const { data, error } = await supabase.from('sagas').insert({
    title: input.title.slice(0, 100), intro: input.intro.slice(0, 800),
    starts_at: input.startsAt.toISOString(), ends_at: endsAt.toISOString(),
    reward_pulse: Math.max(0, Math.floor(input.rewardPulse)),
    created_by: input.createdBy,
    status: input.startsAt.getTime() <= Date.now() ? 'running' : 'scheduled',
    chapters_json: chapters,
  }).select('*').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, saga: data as Saga };
}

export async function listActiveSagas(): Promise<Saga[]> {
  const { data } = await supabase.from('sagas').select('*').in('status', ['scheduled', 'running']).order('starts_at', { ascending: true });
  return (data ?? []) as Saga[];
}

export async function currentDay(saga: Saga): Promise<number | null> {
  if (saga.status !== 'running') return null;
  const startMs = new Date(saga.starts_at).getTime();
  const day = Math.floor((Date.now() - startMs) / 86_400_000) + 1;
  return day >= 1 && day <= saga.chapters_json.length ? day : null;
}

export async function getProgress(sagaId: number, discordId: string): Promise<{ chapters_completed: number[]; final_claimed: boolean }> {
  const { data } = await supabase.from('saga_progress').select('*').eq('saga_id', sagaId).eq('discord_id', discordId).maybeSingle();
  if (!data) return { chapters_completed: [], final_claimed: false };
  return { chapters_completed: (data as { chapters_completed?: number[] }).chapters_completed ?? [], final_claimed: !!(data as { final_claimed?: boolean }).final_claimed };
}

export async function attemptChapter(sagaId: number, discordId: string, guess: string): Promise<{
  ok: boolean; error?: string; chapter?: Chapter; reward?: number; allDone?: boolean; finalReward?: number;
}> {
  const { data: sagaRaw } = await supabase.from('sagas').select('*').eq('id', sagaId).maybeSingle();
  if (!sagaRaw) return { ok: false, error: 'not_found' };
  const saga = sagaRaw as Saga;
  if (saga.status !== 'running') return { ok: false, error: 'not_running' };
  const day = await currentDay(saga);
  if (!day) return { ok: false, error: 'no_current_chapter' };
  const chapter = saga.chapters_json.find(c => c.day === day);
  if (!chapter) return { ok: false, error: 'chapter_missing' };
  if (normalize(guess) !== chapter.answer) return { ok: false, error: 'wrong' };

  const progress = await getProgress(sagaId, discordId);
  if (progress.chapters_completed.includes(day)) return { ok: false, error: 'already_done_today' };

  const nextCompleted = [...progress.chapters_completed, day];
  await supabase.from('saga_progress').upsert({
    saga_id: sagaId, discord_id: discordId, chapters_completed: nextCompleted,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'saga_id,discord_id' });

  await earnPulse(discordId, chapter.reward_pulse, `Saga #${saga.id} chapter ${day}`, `saga:${saga.id}:${day}`);

  const allDone = nextCompleted.length === saga.chapters_json.length;
  let finalReward = 0;
  if (allDone && !progress.final_claimed) {
    await earnPulse(discordId, saga.reward_pulse, `Saga #${saga.id} completion bonus`, `saga:${saga.id}:final`);
    await supabase.from('saga_progress').update({ final_claimed: true }).eq('saga_id', sagaId).eq('discord_id', discordId);
    finalReward = saga.reward_pulse;
  }

  return { ok: true, chapter, reward: chapter.reward_pulse, allDone, finalReward };
}

// Tick: promote scheduled sagas to running when their time comes; end running
// sagas when their end date passes.
export async function runSagaSweep(client: Client): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: dueToStart } = await supabase.from('sagas').select('*').eq('status', 'scheduled').lte('starts_at', nowIso);
  for (const s of (dueToStart ?? [])) {
    await supabase.from('sagas').update({ status: 'running' }).eq('id', (s as Saga).id);
    const welcomeChannelId = getWelcomeConfig().channel_id;
    if (welcomeChannelId) {
      try {
        const ch = await client.channels.fetch(welcomeChannelId).catch(() => null);
        if (ch && ch.isTextBased() && !ch.isDMBased() && ch.isSendable()) {
          await ch.send(`📖 **Nouvelle saga : ${(s as Saga).title}** commence maintenant ! Utilise \`/saga view id:${(s as Saga).id}\` pour découvrir le premier chapitre.`).catch(() => null);
        }
      } catch (err) { log('ERROR', 'Saga start announce failed', err); }
    }
  }
  const { data: dueToEnd } = await supabase.from('sagas').select('*').eq('status', 'running').lte('ends_at', nowIso);
  for (const s of (dueToEnd ?? [])) {
    await supabase.from('sagas').update({ status: 'ended' }).eq('id', (s as Saga).id);
  }
}
