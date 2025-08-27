// lib/supabase.js
// Browser-side Supabase client (uses the PUBLIC/ANON key, never the service role)

import { createClient } from "@supabase/supabase-js";

// Vite exposes env vars that start with VITE_ to the browser build.
// We also fall back to NEXT_PUBLIC_* in case you set those earlier.
const URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env && (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL));

const ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY));

if (!URL || !ANON_KEY) {
  // Helpful error if env vars aren't set
  throw new Error(
    "Missing Supabase client env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Project → Settings → Environment Variables."
  );
}

export const supabase = createClient(URL, ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Export default too, so either `import supabase` or `import { supabase }` works.
export default supabase;
