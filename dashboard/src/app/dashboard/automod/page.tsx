import { supabase } from '@/lib/supabase';
import { loadChannels } from '@/lib/channels';
import BackLink from '../BackLink';
import AutomodForm, { type ModConfig } from './AutomodForm';

export const dynamic = 'force-dynamic';

const DEFAULTS: ModConfig = {
  mod_log_channel_id: null,
  automod_enabled: false,
  anti_spam: { enabled: true, max_messages: 5, window_seconds: 5, mute_seconds: 600 },
  anti_mass_mentions: { enabled: true, max_mentions: 5, action: 'delete' },
  anti_invites: { enabled: false, action: 'delete' },
  anti_links: { enabled: false, whitelist_domains: [] },
  anti_raid: { enabled: false, max_joins: 10, window_seconds: 30, lockdown_minutes: 10 },
  auto_warn_threshold: 3,
};

async function load(): Promise<ModConfig> {
  const { data } = await supabase.from('settings').select('value_json').eq('key', 'mod_config').maybeSingle();
  const raw = (data?.value_json as Partial<ModConfig>) ?? {};
  return {
    ...DEFAULTS,
    ...raw,
    anti_spam: { ...DEFAULTS.anti_spam, ...(raw.anti_spam ?? {}) },
    anti_mass_mentions: { ...DEFAULTS.anti_mass_mentions, ...(raw.anti_mass_mentions ?? {}) },
    anti_invites: { ...DEFAULTS.anti_invites, ...(raw.anti_invites ?? {}) },
    anti_links: { ...DEFAULTS.anti_links, ...(raw.anti_links ?? {}) },
    anti_raid: { ...DEFAULTS.anti_raid, ...(raw.anti_raid ?? {}) },
  };
}

export default async function AutomodPage() {
  const [cfg, channels] = await Promise.all([load(), loadChannels()]);
  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">🛡️ Auto-moderation</h1>
      <p className="text-pulse-mute mb-6 text-sm">
        Flip individual protections. Every change saves the moment you leave the field.
      </p>
      <AutomodForm initial={cfg} channels={channels} />
    </>
  );
}
