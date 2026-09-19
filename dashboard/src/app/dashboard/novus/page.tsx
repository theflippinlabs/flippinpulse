import { supabase } from '@/lib/supabase';
import BackLink from '../BackLink';
import NovusForm, { type PulsarConfig } from './NovusForm';

export const dynamic = 'force-dynamic';

const DEFAULTS: PulsarConfig = {
  enabled: false,
  channel_id: null,
  language: 'English',
  interval_hours: 3.5,
  tag_active_members: true,
  reply_to_mentions: true,
  welcome: true,
  host_events: true,
  celebrate: true,
  recap: true,
  recap_time_utc: '20:00',
  missions: true,
  mission_interval_hours: 6,
};

async function load(): Promise<PulsarConfig> {
  const { data } = await supabase.from('settings').select('value_json').eq('key', 'pulsar_config').maybeSingle();
  const stored = (data?.value_json as Partial<PulsarConfig>) ?? {};
  return { ...DEFAULTS, ...stored };
}

export default async function NovusPage() {
  const cfg = await load();
  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">🧠 Novus</h1>
      <p className="text-pulse-mute mb-6 text-sm">
        Your AI Community Manager. Every change saves the moment you tap it.
      </p>
      <NovusForm initial={cfg} />
    </>
  );
}
