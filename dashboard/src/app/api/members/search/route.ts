import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Search up to 15 members by username substring. Excludes the caller.
// Used by the Challenge dialogs on /app/pet and /app/cards.
export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const { data } = await supabase
    .from('discord_users')
    .select('discord_id, username, avatar_url')
    .ilike('username', `%${q.replace(/[%_]/g, '\\$&')}%`)
    .neq('discord_id', session.id)
    .order('points_total', { ascending: false })
    .limit(15);
  return NextResponse.json({ results: data ?? [] });
}
