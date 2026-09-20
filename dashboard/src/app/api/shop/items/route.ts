import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const CATEGORIES = new Set(['role', 'perk', 'ticket', 'cosmetic', 'irl']);

interface ItemInput {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  price_pulse?: number;
  stock_total?: number | null;
  stock_remaining?: number | null;
  max_per_user?: number | null;
  cooldown_hours?: number | null;
  is_active?: boolean;
  auto_apply?: boolean;
  image_url?: string | null;
}

// POST accepts { action: 'create'|'update'|'delete', item }.
// Only admins allowed.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const item = (body.item ?? {}) as ItemInput;

  if (action === 'create') {
    if (!item.name || !item.category || !CATEGORIES.has(item.category)) {
      return NextResponse.json({ error: 'name + valid category required' }, { status: 400 });
    }
    const price = Math.max(0, Math.floor(item.price_pulse ?? 0));
    const stockTotal = item.stock_total != null ? Math.max(0, Math.floor(item.stock_total)) : null;
    const row = {
      name: item.name.slice(0, 120),
      description: (item.description ?? '').slice(0, 500),
      category: item.category,
      price_pulse: price,
      stock_total: stockTotal,
      stock_remaining: stockTotal,
      max_per_user: item.max_per_user != null ? Math.max(1, Math.floor(item.max_per_user)) : 1,
      cooldown_hours: item.cooldown_hours != null ? Math.max(0, Math.floor(item.cooldown_hours)) : 0,
      is_active: item.is_active !== false,
      auto_apply: item.auto_apply !== false,
      image_url: item.image_url ?? null,
    };
    const { data, error } = await supabase.from('shop_items').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  if (action === 'update') {
    if (!item.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (item.name !== undefined) patch.name = item.name.slice(0, 120);
    if (item.description !== undefined) patch.description = (item.description ?? '').slice(0, 500);
    if (item.category !== undefined) {
      if (!CATEGORIES.has(item.category)) return NextResponse.json({ error: 'bad category' }, { status: 400 });
      patch.category = item.category;
    }
    if (item.price_pulse !== undefined) patch.price_pulse = Math.max(0, Math.floor(item.price_pulse));
    if (item.stock_total !== undefined) {
      patch.stock_total = item.stock_total == null ? null : Math.max(0, Math.floor(item.stock_total));
    }
    if (item.stock_remaining !== undefined) {
      patch.stock_remaining = item.stock_remaining == null ? null : Math.max(0, Math.floor(item.stock_remaining));
    }
    if (item.max_per_user !== undefined) {
      patch.max_per_user = item.max_per_user == null ? null : Math.max(1, Math.floor(item.max_per_user));
    }
    if (item.cooldown_hours !== undefined) patch.cooldown_hours = Math.max(0, Math.floor(item.cooldown_hours ?? 0));
    if (item.is_active !== undefined) patch.is_active = !!item.is_active;
    if (item.auto_apply !== undefined) patch.auto_apply = !!item.auto_apply;
    if (item.image_url !== undefined) patch.image_url = item.image_url ?? null;
    patch.updated_at = new Date().toISOString();

    const { error } = await supabase.from('shop_items').update(patch).eq('id', item.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete') {
    if (!item.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { error } = await supabase.from('shop_items').delete().eq('id', item.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
