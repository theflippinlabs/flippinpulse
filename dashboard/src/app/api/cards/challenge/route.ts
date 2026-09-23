import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { MAX_EQUIPMENT_SLOTS, MAX_LEVEL } from '@/lib/tcgShared';

export const dynamic = 'force-dynamic';

interface EquipInput { cardId: number; level: number; }

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const opponentId = String(body.opponentId ?? '');
  const wager = Math.max(0, Math.min(10_000, Math.floor(Number(body.wager ?? 0))));
  const channelId = String(body.channelId ?? '');
  const characterCardId = Math.floor(Number(body.characterCardId));
  const rawEquip: unknown[] = Array.isArray(body.equipment) ? body.equipment : [];

  if (!/^\d{15,20}$/.test(opponentId)) return NextResponse.json({ error: 'bad_opponent' }, { status: 400 });
  if (opponentId === session.id) return NextResponse.json({ error: 'self_challenge' }, { status: 400 });
  if (!channelId) return NextResponse.json({ error: 'no_channel' }, { status: 400 });
  if (!Number.isFinite(characterCardId) || characterCardId <= 0) return NextResponse.json({ error: 'bad_card' }, { status: 400 });

  const equipment: EquipInput[] = [];
  for (const e of rawEquip) {
    const cardId = Math.floor(Number((e as { cardId?: unknown })?.cardId));
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number((e as { level?: unknown })?.level ?? 1)) || 1));
    if (!Number.isFinite(cardId) || cardId <= 0) return NextResponse.json({ error: 'bad_equipment' }, { status: 400 });
    equipment.push({ cardId, level });
  }
  if (equipment.length > MAX_EQUIPMENT_SLOTS) return NextResponse.json({ error: 'too_many_equipment' }, { status: 400 });

  // Resolve every card ID → code so the bot bridge stays on codes end-to-end.
  const allIds = [characterCardId, ...equipment.map(e => e.cardId)];
  const { data: rows } = await supabase.from('tcg_cards').select('id, code, card_kind, equipment_slot').in('id', allIds);
  const byId = new Map((rows ?? []).map(r => [r.id as number, r as { code: string; card_kind: string; equipment_slot: string | null }]));

  const char = byId.get(characterCardId);
  if (!char) return NextResponse.json({ error: 'bad_card' }, { status: 400 });
  if (char.card_kind !== 'character') return NextResponse.json({ error: 'not_a_character' }, { status: 400 });

  const slotsUsed = new Set<string>();
  const equipmentEntries: { code: string; level: number }[] = [];
  for (const e of equipment) {
    const eq = byId.get(e.cardId);
    if (!eq) return NextResponse.json({ error: 'bad_equipment' }, { status: 400 });
    if (eq.card_kind !== 'equipment' || !eq.equipment_slot) return NextResponse.json({ error: 'not_an_equipment' }, { status: 400 });
    if (slotsUsed.has(eq.equipment_slot)) return NextResponse.json({ error: 'slot_conflict' }, { status: 400 });
    slotsUsed.add(eq.equipment_slot);
    equipmentEntries.push({ code: eq.code, level: e.level });
  }

  const { error } = await supabase.from('dashboard_commands').insert({
    command: 'card_challenge',
    payload_json: {
      challenger_id: session.id,
      opponent_id: opponentId,
      character_code: char.code,
      equipment: equipmentEntries,
      wager,
      channel_id: channelId,
    },
    status: 'pending',
    created_by: session.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
