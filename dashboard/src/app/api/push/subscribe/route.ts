import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Accepts a Web Push subscription payload from the client (the object returned
// by pushManager.subscribe()). Idempotent: rowset keyed on the endpoint URL.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const endpoint = String(body.endpoint ?? '');
  const p256dh = String(body.keys?.p256dh ?? '');
  const auth = String(body.keys?.auth ?? '');
  const userAgent = req.headers.get('user-agent') ?? '';
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'bad_payload' }, { status: 400 });

  const { error } = await supabase.from('push_subscriptions').upsert({
    discord_id: session.id,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
