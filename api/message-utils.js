import { createClient } from "@supabase/supabase-js";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getEnv() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { SUPABASE_URL, SERVICE_KEY, ANON_KEY };
}

export function createAdminClient(SUPABASE_URL, SERVICE_KEY) {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export function createAuthClient(SUPABASE_URL, ANON_KEY, token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

export function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  return body || {};
}

export async function getAuthUserId(SUPABASE_URL, ANON_KEY, token) {
  const supabaseAuth = createAuthClient(SUPABASE_URL, ANON_KEY, token);
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: userErr?.message || "Unauthorized", userId: null };
  }
  return { error: null, userId: userData.user.id };
}

export async function getSupplierByAuthUser(admin, userId) {
  const { data, error } = await admin
    .from("suppliers")
    .select("id,business_name")
    .eq("auth_user_id", userId)
    .maybeSingle();

  return { supplier: data || null, error };
}

export function toMessageDto(row) {
  return {
    id: row.id,
    senderType: row.sender_type,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function ensureThreadForQuote(admin, quote, supplierId) {
  const existing = await admin
    .from("message_threads")
    .select("id,quote_id,supplier_id,status,updated_at")
    .eq("quote_id", quote.id)
    .maybeSingle();

  if (existing.error) {
    return { thread: null, error: existing.error };
  }
  if (existing.data) {
    return { thread: existing.data, error: null };
  }

  const inserted = await admin
    .from("message_threads")
    .insert([
      {
        quote_id: quote.id,
        enquiry_id: quote.enquiry_id || null,
        supplier_id: supplierId,
        status: "open",
        updated_at: new Date().toISOString(),
      },
    ])
    .select("id,quote_id,supplier_id,status,updated_at")
    .single();

  if (!inserted.error) {
    return { thread: inserted.data, error: null };
  }

  if (inserted.error.code === "23505") {
    const retry = await admin
      .from("message_threads")
      .select("id,quote_id,supplier_id,status,updated_at")
      .eq("quote_id", quote.id)
      .maybeSingle();
    return { thread: retry.data || null, error: retry.error };
  }

  return { thread: null, error: inserted.error };
}

export async function ensureSupplierThreadState(admin, threadId, supplierId, patch = {}) {
  const payload = {
    thread_id: threadId,
    supplier_id: supplierId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  return admin
    .from("supplier_thread_state")
    .upsert(payload, { onConflict: "thread_id,supplier_id" });
}
