import { getSession } from '@/lib/auth';
import { loadCatalog, loadCollectionLevels, PACK_COST } from '@/lib/tcg';
import { getLocale } from '@/lib/i18n';
import { loadChannels, pickDefaultShareChannel } from '@/lib/channels';
import CardsClient from './CardsClient';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const session = getSession()!;
  const locale = getLocale();
  const [catalog, levels, userRow, channels] = await Promise.all([
    loadCatalog(),
    loadCollectionLevels(session.id),
    supabase.from('discord_users').select('balance_pulse').eq('discord_id', session.id).maybeSingle(),
    loadChannels(),
  ]);
  const balance = (userRow.data?.balance_pulse ?? 0) as number;
  // Serialize the per-level map as a plain object so it can cross the RSC
  // boundary; the client rebuilds a Map from it.
  const ownedLevels: Record<string, Record<string, number>> = {};
  for (const [cardId, inner] of levels) {
    ownedLevels[String(cardId)] = {};
    for (const [level, qty] of inner) ownedLevels[String(cardId)][String(level)] = qty;
  }
  const publicChannels = channels.filter(c => c.type === 0);
  return (
    <CardsClient
      fr={locale === 'fr'}
      catalog={catalog}
      ownedLevels={ownedLevels}
      balance={balance}
      packCost={PACK_COST}
      channels={publicChannels.map(c => ({ channel_id: c.channel_id, name: c.name }))}
      defaultChannel={pickDefaultShareChannel(publicChannels)}
    />
  );
}
