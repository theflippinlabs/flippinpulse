import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

const ERRORS: Record<string, string> = {
  missing_code: 'Discord did not send back a code. Try again.',
  token_exchange: 'Discord refused the token exchange. Check your client secret.',
  userinfo: 'Could not fetch your Discord identity.',
  not_admin: 'Your Discord account is not on the allowlist. Ask a Lord to add your ID.',
  oauth_not_configured: 'The dashboard is missing DISCORD_CLIENT_ID / SECRET / REDIRECT_URI.',
};

export default function Landing({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession();
  if (session) redirect('/dashboard');
  const err = searchParams.error ? ERRORS[searchParams.error] ?? 'Login failed.' : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-pulse-card border border-pulse-border rounded-2xl p-8 shadow-xl relative overflow-hidden">
        <div className="absolute inset-x-0 -top-40 h-64 bg-brand-glow pointer-events-none" />
        <div className="text-center mb-6 relative">
          <div className="text-5xl">⚡</div>
          <h1 className="text-2xl font-bold mt-2 brand-text">NOVARYS // Command Deck</h1>
          <p className="text-pulse-mute mt-2 text-sm">Live stats &amp; admin console for the community.</p>
        </div>
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{err}</div>
        )}
        <a
          href="/api/auth/login"
          className="block w-full text-center bg-brand-gradient hover:opacity-90 text-black font-semibold py-3 rounded-lg transition-opacity shadow-brand relative"
        >
          Sign in with Discord
        </a>
        <p className="text-xs text-pulse-mute text-center mt-4">
          Access is restricted to Lords. Your Discord ID must be in <code className="text-pulse-brand">DASHBOARD_ADMIN_IDS</code>.
        </p>
      </div>
    </main>
  );
}
