import { getSession } from '@/lib/auth';
import { getActivePet, getRecentBattles, SPECIES } from '@/lib/pets';
import { getLocale } from '@/lib/i18n';
import PetClient from './PetClient';

export const dynamic = 'force-dynamic';

export default async function PetPage() {
  const session = getSession()!;
  const locale = getLocale();
  const pet = await getActivePet(session.id);
  const battles = pet ? await getRecentBattles(pet.id, 10) : [];
  return <PetClient fr={locale === 'fr'} pet={pet} species={SPECIES} battles={battles} />;
}
