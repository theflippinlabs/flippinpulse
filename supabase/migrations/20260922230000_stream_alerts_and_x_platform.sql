-- ============================================================
-- Stream alerts backing tables.
--
-- These were previously created ad-hoc — this migration formalizes
-- them so a fresh Supabase provision has everything the bot needs.
-- All statements are idempotent so re-running is safe.
--
-- The `platform` column is plain TEXT (no enum) so future platforms
-- like `x`, `tiktok`, `kick` slot in with no schema change.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stream_links (
  discord_id     TEXT NOT NULL,
  platform       TEXT NOT NULL,
  handle         TEXT NOT NULL,
  external_id    TEXT,
  last_live_key  TEXT,
  last_live_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_stream_links_platform ON public.stream_links (platform);

CREATE TABLE IF NOT EXISTS public.live_stream_sessions (
  id            BIGSERIAL PRIMARY KEY,
  discord_id    TEXT NOT NULL,
  source        TEXT NOT NULL,
  external_url  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_discord ON public.live_stream_sessions (discord_id, created_at DESC);

ALTER TABLE public.stream_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_stream_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stream_links' AND policyname = 'stream_links_service_all') THEN
    CREATE POLICY stream_links_service_all ON public.stream_links FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'live_stream_sessions' AND policyname = 'live_stream_sessions_service_all') THEN
    CREATE POLICY live_stream_sessions_service_all ON public.live_stream_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;
