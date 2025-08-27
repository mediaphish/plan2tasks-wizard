// lib/supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * Public browser client (uses anon key).
 * Works with Vite or NEXT_PUBLIC_* envs.
 */
const url =
  import.meta?.env?.VITE_SUPABASE_URL ||
  window?.__SUPABASE_URL__ ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const anon =
  import.meta?.env?.VITE_SUPABASE_ANON_KEY ||
  window?.__SUPABASE_ANON_KEY__ ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Missing Supabase envs. Set URL and ANON key.");
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for OAuth redirect handling
  },
});
