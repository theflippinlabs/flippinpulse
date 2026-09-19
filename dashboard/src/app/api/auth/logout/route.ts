import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export async function GET(req: NextRequest) {
  clearSessionCookie();
  return NextResponse.redirect(new URL('/', req.url));
}
