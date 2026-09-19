import Link from 'next/link';

export default function BackLink({ href = '/dashboard/hub', label = 'Hub' }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3"
    >
      <span className="text-lg leading-none">‹</span>
      <span>Back to {label}</span>
    </Link>
  );
}
