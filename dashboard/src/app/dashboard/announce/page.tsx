import AnnounceForm from './AnnounceForm';
import { loadChannels } from '@/lib/channels';

export const dynamic = 'force-dynamic';

export default async function AnnouncePage() {
  const channels = await loadChannels();
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-2">📣 Announce</h1>
      <p className="text-pulse-mute mb-6 text-sm">
        Post an announcement to any Discord channel. The bot picks it up within ~15 seconds and sends it as its own message.
      </p>
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-6">
        <AnnounceForm channels={channels} />
      </div>
    </>
  );
}
