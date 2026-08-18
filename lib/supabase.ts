import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let cached: SupabaseClient | undefined;

/**
 * The publishable key is designed to ship in the browser — RLS is what makes it
 * read-only. It still comes from the environment rather than the source, so it
 * can be rotated without a commit.
 *
 * The client is stateless here (`persistSession: false`), so one is reused
 * rather than constructing a fresh set of sub-clients on every render of a
 * force-dynamic page.
 */
export function createReadClient(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set — see .env.example",
    );
  }
  cached ??= createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const supabaseConfigured = Boolean(url && key);
