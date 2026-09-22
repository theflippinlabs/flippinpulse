import { getSession } from '@/lib/auth';
import { getActivePet, getRecentBattles, SPECIES } from '@/lib/pets';
import { getLocale } from '@/lib/i18n';
import { loadChannels, pickDefaultShareChannel } from '@/lib/channels';
import PetClient from './PetClient';

export const dynamic = 'force-dynamic';

export default async function PetPage() {
  const session = getSession()!;
  const locale = getLocale();
  const [pet, channels] = await Promise.all([getActivePet(session.id), loadChannels()]);
  const battles = pet ? await getRecentBattles(pet.id, 10) : [];
  const publicChannels = channels.filter(c => c.type === 0); // GuildText
  const defaultChannel = pickDefaultShareChannel(publicChannels);
  return (
    <PetClient
      fr={locale === 'fr'}
      pet={pet}
      species={SPECIES}
      battles={battles}
      channels={publicChannels.map(c => ({ channel_id: c.channel_id, name: c.name }))}
      defaultChannel={defaultChannel}
    />
  );
}
