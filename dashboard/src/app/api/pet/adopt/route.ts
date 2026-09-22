import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { adoptPet, type SpeciesKey } from '@/lib/pets';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const species = String(body.species ?? '') as SpeciesKey;
  const name = String(body.name ?? '');
  const res = await adoptPet(session.id, species, name);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ pet: res.pet });
}
