import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { loadSeasonWithTiersAndProgress, tierFromXP } from '@/lib/battlePass';
import { getLocale, t } from '@/lib/i18n';
import BattlePassClient from './BattlePassClient';

export const dynamic = 'force-dynamic';

export default async function BattlePassPage() {
  const session = getSession()!;
  const locale = getLocale();
  const fr = locale === 'fr';
  const bundle = await loadSeasonWithTiersAndProgress(session.id);

  if (!bundle) {
    return (
      <>
        <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
          <span className="text-lg leading-none">‹</span><span>{t('common.back')}</span>
        </Link>
        <h1 className="text-2xl font-bold mb-1">🎫 Battle Pass</h1>
        <div className="mt-6 rounded-xl bg-pulse-card border border-pulse-border p-6 text-center text-pulse-mute">
          {fr ? 'Aucune saison active pour l\'instant. Reviens bientôt.' : 'No active season right now. Come back soon.'}
        </div>
      </>
    );
  }

  const { season, tiers, progress } = bundle;
  const currentTier = tierFromXP(progress.xp, season);
  const xpIntoTier = progress.xp % season.xp_per_tier;
  const xpNeeded = season.xp_per_tier;
  const endsIn = Math.max(0, new Date(season.ends_at).getTime() - Date.now());
  const days = Math.floor(endsIn / 86_400_000);
  const hours = Math.floor((endsIn % 86_400_000) / 3_600_000);

  return (
    <BattlePassClient
      fr={fr}
      season={season}
      tiers={tiers}
      progress={progress}
      currentTier={currentTier}
      xpIntoTier={xpIntoTier}
      xpNeeded={xpNeeded}
      endsInDays={days}
      endsInHours={hours}
    />
  );
}
