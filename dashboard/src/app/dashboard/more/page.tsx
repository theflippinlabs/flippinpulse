import Link from 'next/link';

export default function MorePage() {
  const items = [
    { href: '/dashboard/tournaments', label: 'Tournaments', emoji: '🏟️', hint: 'PvP brackets and history' },
    { href: '/dashboard/cosmetics', label: 'Cosmetics', emoji: '✨', hint: 'Titles & profile colors' },
  ];
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">More</h1>
      <div className="space-y-2">
        {items.map(i => (
          <Link
            key={i.href}
            href={i.href}
            className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl px-4 py-4 hover:bg-pulse-border/40"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{i.emoji}</span>
              <div>
                <div className="font-semibold">{i.label}</div>
                <div className="text-xs text-pulse-mute">{i.hint}</div>
              </div>
            </div>
            <span className="text-pulse-mute">›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
