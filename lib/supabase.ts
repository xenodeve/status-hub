import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * The publishable key is designed to ship in the browser — RLS is what makes it
 * read-only. It still comes from the environment rather than the source, so it
 * can be rotated without a commit.
 */
export function createReadClient() {
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set — see .env.example",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const supabaseConfigured = Boolean(url && key);
