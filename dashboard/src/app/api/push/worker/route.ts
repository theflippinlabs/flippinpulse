import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Push worker — drains the push_queue and delivers each notification via Web
 * Push to every subscription that member has. Intended to be called by a
 * Vercel Cron every minute. Also callable manually with the internal token.
 *
 * Env vars required:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   ("mailto:you@…")
 *   PUSH_WORKER_TOKEN                                      — bearer for manual runs
 */
export async function POST(req: NextRequest) {
  const token = process.env.PUSH_WORKER_TOKEN;
  const auth = req.headers.get('authorization') ?? '';
  const okBearer = token && auth === `Bearer ${token}`;
  // Vercel cron requests include the header 'x-vercel-cron' — accept those too.
  const okCron = req.headers.get('x-vercel-cron') === '1';
  if (!okBearer && !okCron) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@pulse-engine.xyz';
  if (!pub || !priv) return NextResponse.json({ error: 'vapid_not_configured' }, { status: 503 });
  webpush.setVapidDetails(subject, pub, priv);

  const { data: pending } = await supabase.from('push_queue').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(50);
  const rows = (pending ?? []) as { id: number; discord_id: string; title: string; body: string; url: string }[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('discord_id', row.discord_id);
    const subsRows = (subs ?? []) as { id: number; endpoint: string; p256dh: string; auth: string }[];
    if (!subsRows.length) {
      await supabase.from('push_queue').update({ status: 'failed', sent_at: new Date().toISOString() }).eq('id', row.id);
      failed += 1;
      continue;
    }
    let anySucceeded = false;
    for (const s of subsRows) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: row.title, body: row.body, url: row.url }),
        );
        anySucceeded = true;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode ?? 0;
        if (status === 404 || status === 410) {
          // Subscription is dead — remove it.
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
    if (anySucceeded) {
      await supabase.from('push_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id);
      sent += 1;
    } else {
      await supabase.from('push_queue').update({ status: 'failed', sent_at: new Date().toISOString() }).eq('id', row.id);
      failed += 1;
    }
  }

  return NextResponse.json({ sent, failed, remaining: Math.max(0, rows.length - sent - failed) });
}

// Support GET so Vercel Cron scheduler can hit it too.
export async function GET(req: NextRequest) { return POST(req); }
