import { createClient } from "@supabase/supabase-js";

export function getAdminClient() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, code: 500, error: "Missing server env vars" };
  }
  return {
    ok: true,
    admin: createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }),
    SUPABASE_URL,
  };
}

