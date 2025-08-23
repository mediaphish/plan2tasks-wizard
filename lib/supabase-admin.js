// lib/supabase-admin.js
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL;

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || // your current name
  process.env.SUPABASE_SERVICE_ROLE;       // alternate name some guides use

if (!url || !key) {
  throw new Error(
    "Missing Supabase env vars: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE)."
  );
}

// IMPORTANT: This file is server-only. Do NOT import it from client code.
export const supabaseAdmin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

