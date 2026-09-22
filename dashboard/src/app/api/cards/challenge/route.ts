import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_EQUIPMENT_SLOTS = 3;

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const opponentId = String(body.opponentId ?? '');
  const wager = Math.max(0, Math.min(10_000, Math.floor(Number(body.wager ?? 0))));
  const channelId = String(body.channelId ?? '');

  // New payload: characterCardId + equipmentCardIds. We also accept a legacy
  // cardCode/characterCode/equipmentCodes shape so older callers keep working
  // while the web app rolls forward.
  const characterCardId = Number(body.characterCardId);
  const equipmentCardIds: number[] = Array.isArray(body.equipmentCardIds)
    ? body.equipmentCardIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  const legacyCode = String(body.cardCode ?? body.characterCode ?? '').trim();
  const legacyEquipmentCodes: string[] = Array.isArray(body.equipmentCodes)
    ? body.equipmentCodes.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
    : [];

  if (!/^\d{15,20}$/.test(opponentId)) return NextResponse.json({ error: 'bad_opponent' }, { status: 400 });
  if (opponentId === session.id) return NextResponse.json({ error: 'self_challenge' }, { status: 400 });
  if (!channelId) return NextResponse.json({ error: 'no_channel' }, { status: 400 });
  if (equipmentCardIds.length > MAX_EQUIPMENT_SLOTS) return NextResponse.json({ error: 'too_many_equipment' }, { status: 400 });

  // Resolve card IDs → codes so the bot side stays with codes end-to-end. If
  // the caller only sent legacy codes we skip the lookup and pass them along.
  let characterCode = legacyCode;
  let equipmentCodes = legacyEquipmentCodes;

  const idsToResolve: number[] = [];
  if (Number.isFinite(characterCardId) && characterCardId > 0) idsToResolve.push(characterCardId);
  idsToResolve.push(...equipmentCardIds);
  if (idsToResolve.length > 0) {
    const { data: rows } = await supabase.from('tcg_cards').select('id, code, card_kind').in('id', idsToResolve);
    const byId = new Map((rows ?? []).map(r => [r.id as number, r as { code: string; card_kind: string }]));

    if (Number.isFinite(characterCardId) && characterCardId > 0) {
      const char = byId.get(characterCardId);
      if (!char) return NextResponse.json({ error: 'bad_card' }, { status: 400 });
      if (char.card_kind !== 'character') return NextResponse.json({ error: 'not_a_character' }, { status: 400 });
      characterCode = char.code;
    }
    const resolvedEquip: string[] = [];
    for (const eid of equipmentCardIds) {
      const eq = byId.get(eid);
      if (!eq) return NextResponse.json({ error: 'bad_equipment' }, { status: 400 });
      if (eq.card_kind !== 'equipment') return NextResponse.json({ error: 'not_an_equipment' }, { status: 400 });
      resolvedEquip.push(eq.code);
    }
    if (resolvedEquip.length > 0) equipmentCodes = resolvedEquip;
  }

  if (!characterCode) return NextResponse.json({ error: 'bad_card' }, { status: 400 });

  const { error } = await supabase.from('dashboard_commands').insert({
    command: 'card_challenge',
    payload_json: {
      challenger_id: session.id,
      opponent_id: opponentId,
      // Kept for backwards compatibility with earlier bot builds that only
      // read card_code — the new bot reads character_code + equipment_codes.
      card_code: characterCode,
      character_code: characterCode,
      equipment_codes: equipmentCodes,
      wager,
      channel_id: channelId,
    },
    status: 'pending',
    created_by: session.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
