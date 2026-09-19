# Novarys — Command Deck (Dashboard Web)

A read-only Next.js dashboard for the Novarys community. Reads directly
from the same Supabase project the Discord bot writes to.

## Pages
- **Overview** — KPI cards (members, PULSE in wallets, active tournois, jails, lottery pot, badges unlocked) + top members + recent jails + latest tournaments.
- **Members** — top 200 by lifetime points with weekly / balance / streak / last-seen columns.
- **Jails** — every active jail (inmate, jailer, reason, expiry).
- **Tournaments** — last 50 tournois (status, buy-in, pot, players, winner).
- **Cosmetics** — who bought titles / profile colors / name colors, with swatches.

## Auth
Discord OAuth. After a login, the callback checks the user's Discord ID
against `DASHBOARD_ADMIN_IDS` — anyone else is bounced with an error.
Session is a signed HMAC cookie (7 days).

## Env vars
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role — server-only>
DISCORD_CLIENT_ID=<your app>
DISCORD_CLIENT_SECRET=<your app>
DISCORD_REDIRECT_URI=https://<dashboard>/api/auth/callback
DASHBOARD_ADMIN_IDS=1234567890,9876543210      # comma-separated
SESSION_SECRET=<random 32+ char string>
```

## Local dev
```bash
cd dashboard
cp .env.example .env.local  # fill in the values
npm install
npm run dev                 # http://localhost:3000
```

For local dev, set `DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback`
and add it to your Discord app's OAuth redirects.

## Deploy on Vercel
1. `vercel` in this folder (or import the repo in Vercel UI, set the
   **root directory** to `dashboard`).
2. Add every env var from `.env.example` in Vercel → Project → Settings → Environment Variables.
3. Add the production redirect URI to your Discord OAuth app:
   `https://<your-dashboard>.vercel.app/api/auth/callback`.
4. Deploy. First visit → click "Sign in with Discord".
