import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Exposes the server's public VAPID key so the client can subscribe with the
// correct applicationServerKey.
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  if (!publicKey) return NextResponse.json({ error: 'vapid_not_configured' }, { status: 503 });
  return NextResponse.json({ publicKey });
}
