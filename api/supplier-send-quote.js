import { createClient } from "@supabase/supabase-js";
import { notifyQuoteSent } from "./_lib/notifications.js";

/**
 * POST /api/supplier-send-quote
 * Body: { quote_id }
 *
 * Rules:
 * - requires Authorization: Bearer <user_jwt>
 * - supplier must own quote
 * - quote must be draft
 * - quote must have at least 1 item
 * - supplier must have >= 1 credit
 * - status set to sent and sent_at set
 * - credits decremented by 1
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !ANON_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_ANON_KEY_or_VITE_SUPABASE_ANON_KEY: !!ANON_KEY,
        },
      });
    }

    if (!SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing service role key",
        details: "SUPABASE_SERVICE_ROLE_KEY is required for server-side writes",
      });
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Unauthorized" });

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const quote_id = body?.quote_id;
    if (!quote_id || !UUID_RE.test(String(quote_id))) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid quote_id" });
    }

    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized", details: userErr?.message });
    }
    const userId = userData.user.id;

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: supplier, error: supErr } = await supabaseAdmin
      .from("suppliers")
      .select("id, credits_balance")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(409).json({ ok: false, error: "Cannot send quote", details: "Supplier not found" });
    }

    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotes")
      .select(
        "id,supplier_id,enquiry_id,status,total_amount,total_price_gbp,currency_code,message,notes,created_at,sent_at,accepted_at,declined_at"
      )
      .eq("id", quote_id)
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (qErr) return res.status(500).json({ ok: false, error: "Quote lookup failed", details: qErr.message });
    if (!quote) {
      return res.status(409).json({
        ok: false,
        error: "Cannot send quote",
        details: "Quote not found for this supplier",
      });
    }

    const status = String(quote.status || "").toLowerCase();
    if (status !== "draft") {
      if (["accepted", "declined", "closed"].includes(status)) {
        return res.status(409).json({
          ok: false,
          error: "Cannot send quote",
          details: "Quote is locked.",
        });
      }
      return res.status(409).json({
        ok: false,
        error: "Cannot send quote",
        details: "Quote status must be draft",
      });
    }

    const { count: itemCount, error: itemErr } = await supabaseAdmin
      .from("quote_items")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", quote_id);

    if (itemErr) {
      return res.status(500).json({ ok: false, error: "Item lookup failed", details: itemErr.message });
    }
    if (!itemCount || itemCount < 1) {
      return res.status(409).json({
        ok: false,
        error: "Cannot send quote",
        details: "Quote must have at least one item",
      });
    }

    const currentCredits = Number(supplier.credits_balance ?? 0);
    if (!Number.isFinite(currentCredits) || currentCredits < 1) {
      return res.status(409).json({
        ok: false,
        error: "Cannot send quote",
        details: "Supplier has insufficient credits",
      });
    }

    const nowIso = new Date().toISOString();

    const { data: updatedQuote, error: sendErr } = await supabaseAdmin
      .from("quotes")
      .update({
        status: "sent",
        sent_at: nowIso,
        sent_by_user: userId,
        updated_at: nowIso,
        updated_by_user: userId,
      })
      .eq("id", quote_id)
      .eq("supplier_id", supplier.id)
      .eq("status", "draft")
      .select("*")
      .maybeSingle();

    if (sendErr) {
      return res.status(500).json({ ok: false, error: "Failed to update quote", details: sendErr.message });
    }
    if (!updatedQuote) {
      return res.status(409).json({
        ok: false,
        error: "Cannot send quote",
        details: "Quote is no longer draft (already sent or updated)",
      });
    }

    const { data: creditResult, error: creditErr } = await supabaseAdmin.rpc("apply_credit_delta", {
      p_supplier_id: supplier.id,
      p_delta: -1,
      p_reason: "quote_send",
      p_note: "Quote sent",
      p_related_type: "quote",
      p_related_id: quote_id,
      p_created_by_user: userId,
    });

    const creditRows = Array.isArray(creditResult) ? creditResult[0] : null;

    if (creditErr || !creditRows) {
      await supabaseAdmin
        .from("quotes")
        .update({
          status: "draft",
          sent_at: null,
          sent_by_user: null,
          updated_at: new Date().toISOString(),
          updated_by_user: userId,
        })
        .eq("id", quote_id)
        .eq("supplier_id", supplier.id)
        .eq("status", "sent")
        .eq("sent_at", nowIso);

      if (creditErr) {
        if (String(creditErr.message || "").toUpperCase().includes("INSUFFICIENT_CREDITS")) {
          return res.status(409).json({
            ok: false,
            error: "Cannot send quote",
            details: "Supplier has insufficient credits",
          });
        }
        return res.status(500).json({
          ok: false,
          error: "Failed to update credits balance",
          details: creditErr.message,
        });
      }

      return res.status(409).json({
        ok: false,
        error: "Cannot send quote",
        details: "Supplier has insufficient credits",
      });
    }

    await supabaseAdmin.from("credit_transactions").insert([
      {
        supplier_id: supplier.id,
        change: -1,
        reason: "Quote sent",
        related_quote_id: quote_id,
        created_by_user_id: userId,
      },
    ]);

    await supabaseAdmin.from("quote_events").insert([
      {
        quote_id,
        event_type: "sent",
        actor_type: "supplier",
        actor_user_id: userId,
        meta: { source: "supplier-send-quote" },
      },
    ]);

    await supabaseAdmin
      .from("enquiry_suppliers")
      .update({ supplier_status: "quoted" })
      .eq("enquiry_id", quote.enquiry_id)
      .eq("supplier_id", supplier.id);

    try {
      await notifyQuoteSent({
        admin: supabaseAdmin,
        req,
        quoteId: quote_id,
        supplierId: supplier.id,
      });
    } catch (notifyErr) {
      console.error("quote_sent notification failed:", notifyErr);
    }

    return res.status(200).json({
      ok: true,
      quote: updatedQuote,
      credits_balance: creditRows.credits_balance,
    });
  } catch (err) {
    console.error("supplier-send-quote crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
