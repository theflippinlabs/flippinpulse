import { supabase } from '@/lib/supabase';
import GamesClient, { type Game } from './GamesClient';

export const dynamic = 'force-dynamic';

async function loadGames(): Promise<Game[]> {
  const { data } = await supabase
    .from('games_config')
    .select('game_key, is_enabled, config_json')
    .order('game_key', { ascending: true });
  return (data ?? []) as Game[];
}

export default async function GamesPage() {
  const games = await loadGames();
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-2">🎮 Games</h1>
      <p className="text-pulse-mute mb-4 md:mb-6 text-sm">
        Turn a game on or off in one tap. Members lose access instantly the next time they try to play.
      </p>
      <GamesClient initial={games} />
    </>
  );
}
