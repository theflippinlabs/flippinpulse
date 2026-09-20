import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import GameDetailClient, { type GameData } from './GameDetailClient';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, { name: string; emoji: string }> = {
  crash:         { name: 'Crash',              emoji: '💥' },
  slots:         { name: 'Slots',              emoji: '🎰' },
  blackjack:     { name: 'Blackjack',          emoji: '🃏' },
  roulette:      { name: 'Roulette',           emoji: '🎡' },
  wheel:         { name: 'Wheel',              emoji: '🎯' },
  higherlower:   { name: 'Higher or Lower',    emoji: '🔼' },
  rps:           { name: 'Rock-Paper-Scissors',emoji: '✊' },
  duel:          { name: 'Duel',               emoji: '⚔️' },
  quiz:          { name: 'Quiz',               emoji: '🧠' },
  treasure_drop: { name: 'Treasure drop',      emoji: '💰' },
  typing_race:   { name: 'Typing race',        emoji: '⌨️' },
  battle_royale: { name: 'Battle Royale',      emoji: '🏆' },
  dice_royale:   { name: 'Dice Royale',        emoji: '🎲' },
  chicken_race:  { name: 'Chicken Race',       emoji: '🐔' },
};

export default async function GameDetail({ params }: { params: { key: string } }) {
  const { data } = await supabase
    .from('games_config')
    .select('game_key, is_enabled, config_json')
    .eq('game_key', params.key)
    .maybeSingle();
  if (!data) return notFound();

  const meta = LABELS[data.game_key] ?? { name: data.game_key, emoji: '🎲' };
  const initial: GameData = {
    game_key: data.game_key,
    is_enabled: data.is_enabled,
    config_json: (data.config_json ?? {}) as Record<string, unknown>,
    label: meta.name,
    emoji: meta.emoji,
  };

  return (
    <>
      <Link
        href="/dashboard/games"
        className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3"
      >
        <span className="text-lg leading-none">‹</span>
        <span>Back to Games</span>
      </Link>
      <h1 className="text-xl md:text-2xl font-bold mb-2">{meta.emoji} {meta.name}</h1>
      <p className="text-pulse-mute mb-6 text-sm">
        Tune the game live. Every value saves the moment you leave the field.
      </p>
      <GameDetailClient initial={initial} />
    </>
  );
}
