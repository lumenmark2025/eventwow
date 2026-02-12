import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/supplier-create-draft-quote
 * Body: { enquiry_id }
 *
 * Secured:
 * - requires Authorization: Bearer <user_jwt>
 * - verifies auth user maps to suppliers.auth_user_id
 * - verifies supplier is linked to enquiry via enquiry_suppliers
 * - enforces 1 quote per enquiry+supplier
 *
 * Creates:
 * - quotes row (draft)
 *
 * Notes:
 * - Uses service role for DB writes to avoid loosening RLS during early MVP.
 * - This file is ESM (project has "type": "module").
 */
export default async function handler(req, res) {
  try {
    // Browser sanity check
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        route: "supplier-create-draft-quote",
        note: "POST only. Send { enquiry_id } with Authorization: Bearer <token>.",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const ANON_KEY =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return res.status(500).json({
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
        },
      });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    // Vercel can hand req.body as object already, but be defensive
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const enquiry_id = body && body.enquiry_id;
    if (!enquiry_id) {
      return res.status(400).json({ error: "Missing enquiry_id" });
    }

    // Validate session as the user (JWT)
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({
        error: "Invalid session",
        details: userErr ? userErr.message : null,
      });
    }

    const userId = userData.user.id;

    // Service role for privileged DB work
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Resolve supplier for this auth user
    const { data: supplier, error: supErr } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (supErr) {
      return res.status(400).json({ error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(403).json({ error: "Not a supplier user" });
    }

    // Verify supplier is linked to enquiry (must exist in enquiry_suppliers)
    const { data: link, error: linkErr } = await supabaseAdmin
      .from("enquiry_suppliers")
      .select("id")
      .eq("enquiry_id", enquiry_id)
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (linkErr) {
      return res.status(400).json({ error: "Link check failed", details: linkErr.message });
    }
    if (!link) {
      return res.status(403).json({ error: "Forbidden (not linked to this enquiry)" });
    }

    // Enforce one quote per enquiry+supplier
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("quotes")
      .select("id,status")
      .eq("enquiry_id", enquiry_id)
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (exErr) {
      return res.status(400).json({ error: "Quote lookup failed", details: exErr.message });
    }

    if (existing && existing.id) {
      return res.status(200).json({
        ok: true,
        existed: true,
        quote_id: existing.id,
        status: existing.status,
      });
    }

    // Create draft quote
    const { data: created, error: crErr } = await supabaseAdmin
      .from("quotes")
      .insert([
        {
          enquiry_id,
          supplier_id: supplier.id,
          status: "draft",
          total_amount: 0,
          total_price_gbp: 0,
          currency_code: "GBP",
          created_by_user_id: userId,
        },
      ])
      .select("id")
      .single();

    if (crErr) {
      return res.status(400).json({ error: "Failed to create quote", details: crErr.message });
    }

    return res.status(200).json({
      ok: true,
      existed: false,
      quote_id: created.id,
      status: "draft",
    });
  } catch (err) {
    console.error("supplier-create-draft-quote crashed:", err);
    return res.status(500).json({
      error: "Internal Server Error",
      details: String(err && err.message ? err.message : err),
    });
  }
}
