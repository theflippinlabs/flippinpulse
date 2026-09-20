import { getSession, isAdmin } from '@/lib/auth';
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
  if (session) redirect(isAdmin(session.id) ? '/dashboard' : '/app');
  const err = searchParams.error ? ERRORS[searchParams.error] ?? 'Login failed.' : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-pulse-card border border-pulse-border rounded-2xl p-8 shadow-xl relative overflow-hidden">
        <div className="absolute inset-x-0 -top-40 h-64 bg-brand-glow pointer-events-none" />
        <div className="text-center mb-6 relative">
          <div className="text-5xl text-pulse-gold">⚡</div>
          <h1 className="text-2xl font-bold mt-2 tracking-wider">NOVARYS <span className="text-pulse-gold">//</span> Pulse</h1>
          <p className="text-pulse-mute mt-2 text-sm">Games, boutique, tournois — signe-toi avec Discord.</p>
        </div>
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{err}</div>
        )}
        <a
          href="/api/auth/login"
          className="block w-full text-center bg-pulse-gold hover:opacity-90 text-black font-semibold py-3 rounded-lg transition-opacity shadow-brand relative"
        >
          Sign in with Discord
        </a>
        <p className="text-xs text-pulse-mute text-center mt-4">
          Ouvert à tous les membres du Discord Novarys.
        </p>
      </div>
    </main>
  );
}
