import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Search up to 15 members by username substring. Excludes the caller.
 *
 * Query params:
 *   q=…         username substring, min 2 chars
 *   with=pet    only return members who own an active pet; the response
 *               includes a `pet` summary ({ name, emoji, species, level, wins, losses })
 *               so the opponent picker can show a real card.
 *   with=cards  only return members who own at least one trading card;
 *               the response includes a `cards` summary ({ unique, total }).
 *
 * Used by the Challenge dialogs on /app/pet and /app/cards.
 */
export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const withFilter = url.searchParams.get('with');
  if (q.length < 2) return NextResponse.json({ results: [] });

  const safe = q.replace(/[%_]/g, '\\$&');
  const { data: users } = await supabase
    .from('discord_users')
    .select('discord_id, username, avatar_url')
    .ilike('username', `%${safe}%`)
    .neq('discord_id', session.id)
    .order('points_total', { ascending: false })
    .limit(withFilter ? 40 : 15);

  if (!users || !users.length) return NextResponse.json({ results: [] });

  if (withFilter === 'pet') {
    const ids = users.map(u => u.discord_id);
    const { data: pets } = await supabase
      .from('pets')
      .select('discord_id, name, emoji, species, level, wins, losses')
      .in('discord_id', ids)
      .eq('is_active', true);
    const petByOwner = new Map((pets ?? []).map(p => [p.discord_id as string, p]));
    const results = users
      .filter(u => petByOwner.has(u.discord_id))
      .slice(0, 15)
      .map(u => ({ ...u, pet: petByOwner.get(u.discord_id) }));
    return NextResponse.json({ results });
  }

  if (withFilter === 'cards') {
    const ids = users.map(u => u.discord_id);
    const { data: collection } = await supabase
      .from('tcg_collection')
      .select('discord_id, card_id, quantity')
      .in('discord_id', ids);
    const stats = new Map<string, { unique: number; total: number }>();
    for (const row of collection ?? []) {
      const owner = row.discord_id as string;
      const qty = (row.quantity as number) ?? 0;
      const existing = stats.get(owner) ?? { unique: 0, total: 0 };
      existing.unique += qty > 0 ? 1 : 0;
      existing.total += qty;
      stats.set(owner, existing);
    }
    const results = users
      .filter(u => (stats.get(u.discord_id)?.total ?? 0) > 0)
      .slice(0, 15)
      .map(u => ({ ...u, cards: stats.get(u.discord_id) }));
    return NextResponse.json({ results });
  }

  return NextResponse.json({ results: users.slice(0, 15) });
}
