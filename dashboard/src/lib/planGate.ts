import { NextResponse } from 'next/server';
import { guildCan } from './plan';
import { currentGuildId } from './guildContext';

// Server-side API helper: refuses the request with a 402 "Payment Required"
// if the current guild's plan does not include the requested feature.
// Client can inspect data.upgrade_url to bounce the Lord to /dashboard/billing.
export async function requirePlan(
  feature: Parameters<typeof guildCan>[1],
): Promise<{ ok: true; guildId: string } | { ok: false; response: NextResponse }> {
  const guildId = currentGuildId();
  const ok = await guildCan(guildId, feature);
  if (ok) return { ok: true, guildId };
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'plan_required',
        feature,
        message: 'This feature is included in a higher Novarys plan.',
        upgrade_url: '/dashboard/billing',
      },
      { status: 402 },
    ),
  };
}
