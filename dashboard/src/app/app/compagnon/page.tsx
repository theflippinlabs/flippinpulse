import { getSession } from '@/lib/auth';
import { getCompanion, loadHistory } from '@/lib/aiCompanion';
import { getLocale } from '@/lib/i18n';
import CompanionClient from './CompanionClient';

export const dynamic = 'force-dynamic';

export default async function CompanionPage() {
  const session = getSession()!;
  const locale = getLocale();
  const companion = await getCompanion(session.id);
  const history = companion ? await loadHistory(session.id) : [];
  return <CompanionClient fr={locale === 'fr'} companion={companion} initialHistory={history} />;
}
