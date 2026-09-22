import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { upsertCompanion, type AICompanion } from '@/lib/aiCompanion';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Partial<AICompanion> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 40);
  if (typeof body.persona === 'string') patch.persona = body.persona.trim().slice(0, 200);
  if (typeof body.emoji === 'string') patch.emoji = body.emoji.slice(0, 8);
  if (typeof body.memory_notes === 'string') patch.memory_notes = body.memory_notes.slice(0, 500);
  if (body.language === 'fr' || body.language === 'en') patch.language = body.language;
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (!patch.tone) patch.tone = 'casual';
  const c = await upsertCompanion(session.id, patch);
  return NextResponse.json({ companion: c });
}
