import { Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export interface ServerEvent {
  id: number;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  created_by: string;
  channel_id: string | null;
  reminder_sent: boolean;
  status: 'scheduled' | 'cancelled' | 'ended';
  created_at: string;
}

export async function createEvent(input: {
  title: string; description?: string; startsAt: Date; endsAt?: Date | null;
  location?: string; createdBy: string; channelId?: string | null;
}): Promise<{ ok: boolean; event?: ServerEvent; error?: string }> {
  const { data, error } = await supabase.from('server_events').insert({
    title: input.title.slice(0, 100),
    description: (input.description ?? '').slice(0, 600),
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt ? input.endsAt.toISOString() : null,
    location: (input.location ?? '').slice(0, 100),
    created_by: input.createdBy,
    channel_id: input.channelId ?? null,
  }).select('*').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
  return { ok: true, event: data as ServerEvent };
}

export async function upcomingEvents(limit = 10): Promise<ServerEvent[]> {
  const { data } = await supabase.from('server_events').select('*').eq('status', 'scheduled').gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(limit);
  return (data ?? []) as ServerEvent[];
}

export async function cancelEvent(id: number, byUserId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: event } = await supabase.from('server_events').select('created_by, status').eq('id', id).maybeSingle();
  if (!event) return { ok: false, error: 'not_found' };
  if (event.status !== 'scheduled') return { ok: false, error: 'not_scheduled' };
  if (event.created_by !== byUserId) return { ok: false, error: 'not_owner' };
  await supabase.from('server_events').update({ status: 'cancelled' }).eq('id', id);
  return { ok: true };
}

export async function rsvp(eventId: number, discordId: string, status: 'going' | 'maybe' | 'no'): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('server_event_rsvps').upsert({ event_id: eventId, discord_id: discordId, status }, { onConflict: 'event_id,discord_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function rsvpCounts(eventId: number): Promise<{ going: number; maybe: number; no: number }> {
  const { data } = await supabase.from('server_event_rsvps').select('status').eq('event_id', eventId);
  const counts = { going: 0, maybe: 0, no: 0 } as { going: number; maybe: number; no: number };
  for (const r of (data ?? [])) counts[r.status as 'going' | 'maybe' | 'no'] += 1;
  return counts;
}

// 15-minute reminder sweep: send a heads-up 15 min before events start.
export async function runReminderSweep(client: Client): Promise<void> {
  const now = Date.now();
  const soon = new Date(now + 15 * 60_000).toISOString();
  const { data } = await supabase
    .from('server_events').select('*')
    .eq('status', 'scheduled')
    .eq('reminder_sent', false)
    .lte('starts_at', soon)
    .gte('starts_at', new Date(now).toISOString());
  const rows = (data ?? []) as ServerEvent[];
  for (const e of rows) {
    try {
      // Get all "going" RSVPs
      const { data: rsvps } = await supabase.from('server_event_rsvps').select('discord_id').eq('event_id', e.id).eq('status', 'going');
      for (const r of (rsvps ?? [])) {
        try {
          const user = await client.users.fetch(r.discord_id as string).catch(() => null);
          if (!user) continue;
          await user.send(`⏰ Rappel : **${e.title}** commence dans 15 minutes${e.location ? ` (${e.location})` : ''}. À toute !`).catch(() => null);
        } catch { /* ignore */ }
      }
      if (e.channel_id) {
        const ch = await client.channels.fetch(e.channel_id).catch(() => null);
        if (ch && ch.isTextBased() && !ch.isDMBased() && ch.isSendable()) {
          await ch.send(`⏰ **${e.title}** commence dans 15 min !`).catch(() => null);
        }
      }
      await supabase.from('server_events').update({ reminder_sent: true }).eq('id', e.id);
    } catch (err) { log('ERROR', `Event reminder failed for #${e.id}`, err); }
  }
}
