# Xperience — Premium X Growth Platform

> AI-powered X (Twitter) growth SaaS — built with React, Supabase & Claude AI

![Xperience Dashboard](https://via.placeholder.com/1200x600/0a0a0f/0ea5e9?text=Xperience+Dashboard)

## Features

| Feature | Description |
|---|---|
| **AI Content Generator** | Generate high-engagement tweets in 5 tones using Claude AI |
| **AI Reply Generator** | Craft perfect replies to grow engagement |
| **Trend Explorer** | Real-time trending topics with proprietary scoring algorithm |
| **Analytics** | Track followers, impressions, engagement rate & best post times |
| **Content Scheduler** | Draft, schedule and manage all your posts |
| **Account Manager** | Connect and manage multiple X accounts |

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Auth + PostgreSQL + Realtime + Edge Functions)
- **AI**: Anthropic Claude API (via Edge Functions)
- **State**: TanStack Query v5
- **Forms**: React Hook Form + Zod validation
- **Deployment**: Vercel

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/theflippinlabs/flippinpulse
cd flippinpulse/xperience  # or wherever you cloned to
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration:

```bash
npx supabase db push
# or manually run supabase/migrations/20260322000000_xperience_schema.sql
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Deploy Edge Functions

```bash
npx supabase functions deploy generate-content
npx supabase functions deploy generate-reply
npx supabase functions deploy fetch-trends
```

Set secrets for Edge Functions:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase secrets set X_BEARER_TOKEN=AAAA...   # optional, for real trends
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deployment (Vercel)

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel
```

### Option B: GitHub Integration

1. Push to GitHub
2. Import project in [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

## Architecture

```
xperience/
├── src/
│   ├── App.tsx                  # Routes + providers
│   ├── main.tsx                 # Entry point
│   ├── index.css                # Global styles + design tokens
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   ├── ai.ts                # AI service (calls Edge Functions)
│   │   ├── trends.ts            # Trend system + scoring algorithm
│   │   ├── validation.ts        # Zod schemas (all forms)
│   │   ├── rateLimit.ts         # Client-side rate limiting
│   │   └── utils.ts             # Shared utilities
│   ├── hooks/
│   │   └── useAuth.ts           # Auth hook
│   ├── components/
│   │   ├── AuthGuard.tsx        # Protected route wrapper
│   │   └── layout/
│   │       ├── Sidebar.tsx      # Navigation sidebar
│   │       └── AppLayout.tsx    # Page layout wrapper
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx        # Growth overview
│   │   ├── ContentGenerator.tsx # AI tweet generation
│   │   ├── ReplyGenerator.tsx   # AI reply generation
│   │   ├── Trends.tsx           # Trend explorer
│   │   ├── Analytics.tsx        # Growth analytics
│   │   ├── Scheduler.tsx        # Content calendar
│   │   ├── Accounts.tsx         # X account management
│   │   └── Settings.tsx         # User settings
│   └── types/
│       └── database.ts          # Supabase TypeScript types
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20260322000000_xperience_schema.sql
│   └── functions/
│       ├── generate-content/    # AI content Edge Function
│       ├── generate-reply/      # AI reply Edge Function
│       └── fetch-trends/        # Trends Edge Function
├── vercel.json                  # Vercel deployment config
└── .env.example                 # Environment variables template
```

## Trend Scoring Algorithm

Trends are scored 0–100 using a weighted composite:

| Signal | Weight | Description |
|---|---|---|
| Volume | 40% | Raw tweet count |
| Velocity | 30% | Growth rate vs. 1 hour ago |
| Engagement | 20% | Likes + RTs per tweet |
| Recency | 10% | Time since last spike |

## Security

- **Row-Level Security**: All Supabase tables have RLS enabled — users can only access their own data
- **Server-side AI**: API keys never exposed to the browser (Edge Functions only)
- **Input validation**: All forms validated with Zod before submission
- **Rate limiting**: Client-side rate limiting + server-side enforcement in Edge Functions
- **Security headers**: CSP, X-Frame-Options, HSTS via Vercel config

## Environment Variables Reference

| Variable | Where | Required | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` | ✅ | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Supabase Secrets | ✅ | Claude API key for AI features |
| `X_BEARER_TOKEN` | Supabase Secrets | ⚡ | X API key for real trends |
| `X_CLIENT_ID` | Supabase Secrets | ⚡ | X OAuth client ID |
| `X_CLIENT_SECRET` | Supabase Secrets | ⚡ | X OAuth client secret |

Legend: ✅ Required · ⚡ Optional (enables premium features)

---

Built by **The Flippin' Labs** · [theflippinlabs.com](https://theflippinlabs.com)
