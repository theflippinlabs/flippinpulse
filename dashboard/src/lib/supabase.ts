import { createClient } from '@supabase/supabase-js';

// Server-side client: uses the service-role key so it can read every table
// under RLS. This module MUST never be imported in a client component.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
);
