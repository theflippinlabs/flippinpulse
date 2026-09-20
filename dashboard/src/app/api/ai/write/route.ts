import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';

// Anthropic Messages API endpoint. We call it directly with fetch to avoid
// pulling in the SDK — the dashboard bundle already ships a lot.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250929';

// Task-specific system prompts. Kept short — the surface the user drives is
// tight, so a small, opinionated coach beats a general assistant.
const SYSTEMS: Record<string, string> = {
  announce: [
    'Tu es le rédacteur en chef de la communauté Discord "Novarys".',
    'Ton rôle est d\'aider un Lord (admin) à rédiger une annonce claire, énergique et engageante.',
    'Style : direct, tutoyer les membres, un emoji au maximum par paragraphe, jamais lourd.',
    'Sortie attendue : un seul bloc de texte prêt à copier-coller dans Discord, sans balises Markdown lourdes.',
    'Longueur : 3 à 6 lignes courtes maximum. Si l\'utilisateur donne plusieurs infos, hiérarchise.',
    'Si l\'utilisateur demande un titre séparé, mets-le sur la première ligne en gras Discord (**Titre**).',
  ].join('\n'),
  tournament: [
    'Tu es le rédacteur en chef de la communauté Discord "Novarys".',
    'Ton rôle est de proposer un TITRE court (max 60 caractères) ET une DESCRIPTION accrocheuse pour un tournoi PvP.',
    'Sortie attendue : "TITRE: <titre>" sur la première ligne, "DESCRIPTION: <description>" sur la deuxième.',
    'Style : gladiateur, tension, honneur. Tutoyer. Un emoji max au titre.',
    'Description : 1 à 2 phrases courtes qui donnent envie de s\'inscrire.',
  ].join('\n'),
  mission: [
    'Tu es le rédacteur en chef de la communauté Discord "Novarys".',
    'Ton rôle est de rédiger un objectif de mission avec récompense.',
    'Sortie attendue : "TITRE: <titre>" puis "DESCRIPTION: <description>".',
    'Ton : motivant, urgent, mais pas menaçant. Tutoyer.',
  ].join('\n'),
  free: 'Tu es un assistant francophone concis pour un Lord de la communauté Novarys. Réponds toujours en français, en 3 à 6 lignes maximum.',
};

interface Message { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({
      error: 'ANTHROPIC_API_KEY not set on Vercel. Add it in Project Settings → Environment Variables, then redeploy.',
    }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = typeof body.kind === 'string' && SYSTEMS[body.kind] ? body.kind : 'free';
  const raw = Array.isArray(body.messages) ? body.messages : [];

  const messages: Message[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: string }).content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      messages.push({ role, content: content.slice(0, 4000) });
    }
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Send at least one user message.' }, { status: 400 });
  }
  // Cap the window to keep bills sane.
  const trimmed = messages.slice(-10);

  const anthropicRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEMS[kind],
      messages: trimmed,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text().catch(() => '');
    return NextResponse.json(
      { error: `Anthropic ${anthropicRes.status}: ${errText.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const data = await anthropicRes.json();
  const text = Array.isArray(data.content)
    ? data.content.filter((b: { type?: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('\n').trim()
    : '';
  if (!text) return NextResponse.json({ error: 'Empty response from Anthropic.' }, { status: 502 });

  return NextResponse.json({ reply: text });
}
