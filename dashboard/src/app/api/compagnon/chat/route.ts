import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { appendMessage, buildSystem, getCompanion, loadHistory } from '@/lib/aiCompanion';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250929';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.message ?? '').slice(0, 2000);
  if (!text.trim()) return NextResponse.json({ error: 'empty_message' }, { status: 400 });

  const companion = await getCompanion(session.id);
  if (!companion || !companion.is_active) return NextResponse.json({ error: 'setup_required' }, { status: 400 });

  const history = await loadHistory(session.id);
  const messages = [...history.map(m => ({ role: m.role, content: m.content })), { role: 'user' as const, content: text }];

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: buildSystem(companion, session.username),
      messages,
    }),
  });
  if (!res.ok) return NextResponse.json({ error: 'ai_failed', details: await res.text().catch(() => '') }, { status: 500 });
  const data = await res.json();
  const reply: string = data?.content?.find((b: { type: string }) => b.type === 'text')?.text?.trim() ?? '';
  if (!reply) return NextResponse.json({ error: 'ai_empty' }, { status: 500 });

  await appendMessage(session.id, 'user', text);
  await appendMessage(session.id, 'assistant', reply);

  return NextResponse.json({ reply });
}
