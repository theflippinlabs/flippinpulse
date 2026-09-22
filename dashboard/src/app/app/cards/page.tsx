import { getSession } from '@/lib/auth';
import { loadCatalog, loadCollection, PACK_COST } from '@/lib/tcg';
import { getLocale } from '@/lib/i18n';
import { loadChannels, pickDefaultShareChannel } from '@/lib/channels';
import CardsClient from './CardsClient';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const session = getSession()!;
  const locale = getLocale();
  const [catalog, collection, userRow, channels] = await Promise.all([
    loadCatalog(),
    loadCollection(session.id),
    supabase.from('discord_users').select('balance_pulse').eq('discord_id', session.id).maybeSingle(),
    loadChannels(),
  ]);
  const balance = (userRow.data?.balance_pulse ?? 0) as number;
  const owned = Array.from(collection.entries()).map(([id, q]) => ({ id, quantity: q }));
  const publicChannels = channels.filter(c => c.type === 0);
  return (
    <CardsClient
      fr={locale === 'fr'}
      catalog={catalog}
      ownedRaw={owned}
      balance={balance}
      packCost={PACK_COST}
      channels={publicChannels.map(c => ({ channel_id: c.channel_id, name: c.name }))}
      defaultChannel={pickDefaultShareChannel(publicChannels)}
    />
  );
}
