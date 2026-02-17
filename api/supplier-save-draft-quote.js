import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/supplier-save-draft-quote
 *
 * Manual test (local):
 * curl -i -X POST http://localhost:3000/api/supplier-save-draft-quote \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer <SUPABASE_JWT>" \
 *   -d '{"quote_id":"00000000-0000-0000-0000-000000000000","items":[]}'
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    if (!token) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const quote_id = body?.quote_id;
    const items = body?.items;
    const quote_text = typeof body?.quote_text === "string" ? body.quote_text.trim() : null;

    if (typeof quote_id !== "string" || !UUID_RE.test(quote_id)) {
      return res.status(400).json({
        ok: false,
        error: "Bad request",
        details: "quote_id must be a valid UUID",
      });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({
        ok: false,
        error: "Bad request",
        details: "items must be an array",
      });
    }

    // Validate session as the user (JWT)
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const userId = userData.user.id;

    // Service role for privileged operations
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: supplier, error: supErr } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(403).json({ ok: false, error: "Supplier not found" });
    }

    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("quotes")
      .select(
        "id,status,supplier_id,total_amount,total_price_gbp,currency_code,enquiry_id,message,notes,quote_text,created_at,sent_at,accepted_at,declined_at"
      )
      .eq("id", quote_id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote || quote.supplier_id !== supplier.id) {
      return res.status(403).json({ ok: false, error: "Quote not owned" });
    }

    const status = String(quote.status || "").toLowerCase();
    if (status !== "draft") {
      if (["accepted", "declined", "closed"].includes(status)) {
        return res.status(409).json({ ok: false, error: "Quote is locked." });
      }
      return res.status(409).json({ ok: false, error: "Quote not draft" });
    }

    const normalizedItems = items.map((raw, idx) => {
      const obj = raw && typeof raw === "object" ? raw : {};
      const rawId = typeof obj.id === "string" ? obj.id : null;
      const id = rawId && UUID_RE.test(rawId) ? rawId : null;
      const title = String(obj.title ?? "").trim() || "Item";
      const qty = Number(obj.qty);
      const unit_price = Number(obj.unit_price);
      const sort_order = Number(obj.sort_order);

      return {
        id,
        title,
        qty: Number.isFinite(qty) ? qty : 1,
        unit_price: Number.isFinite(unit_price) ? unit_price : 0,
        sort_order: Number.isFinite(sort_order) ? sort_order : idx + 1,
      };
    });

    const incomingIds = normalizedItems.filter((it) => it.id).map((it) => it.id);

    if (incomingIds.length > 0) {
      const { data: existingItems, error: existingErr } = await supabaseAdmin
        .from("quote_items")
        .select("id,quote_id")
        .in("id", incomingIds);

      if (existingErr) {
        return res.status(500).json({ ok: false, error: "Item lookup failed", details: existingErr.message });
      }

      const existingById = new Map((existingItems || []).map((it) => [it.id, it]));
      const invalidId = incomingIds.find((id) => {
        const match = existingById.get(id);
        return !match || match.quote_id !== quote_id;
      });

      if (invalidId) {
        return res.status(400).json({
          ok: false,
          error: "Bad request",
          details: "One or more item ids are invalid for this quote",
        });
      }
    }

    // Delete items that were removed client-side
    if (incomingIds.length === 0) {
      const { error: delErr } = await supabaseAdmin.from("quote_items").delete().eq("quote_id", quote_id);
      if (delErr) {
        return res.status(500).json({ ok: false, error: "Failed to delete items", details: delErr.message });
      }
    } else {
      const inList = `(${incomingIds.map((id) => `"${id}"`).join(",")})`;
      const { error: delErr } = await supabaseAdmin
        .from("quote_items")
        .delete()
        .eq("quote_id", quote_id)
        .not("id", "in", inList);

      if (delErr) {
        return res.status(500).json({ ok: false, error: "Failed to delete items", details: delErr.message });
      }
    }

    const nowIso = new Date().toISOString();

    const existingPayload = normalizedItems
      .filter((it) => it.id)
      .map((it) => ({
        id: it.id,
        quote_id,
        title: it.title,
        qty: it.qty,
        unit_price: it.unit_price,
        sort_order: it.sort_order,
        updated_at: nowIso,
      }));

    const insertPayload = normalizedItems
      .filter((it) => !it.id)
      .map((it) => ({
        quote_id,
        title: it.title,
        qty: it.qty,
        unit_price: it.unit_price,
        sort_order: it.sort_order,
        updated_at: nowIso,
      }));

    if (existingPayload.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("quote_items")
        .upsert(existingPayload, { onConflict: "id" });

      if (upErr) {
        return res.status(500).json({ ok: false, error: "Failed to update items", details: upErr.message });
      }
    }

    if (insertPayload.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("quote_items").insert(insertPayload);
      if (insErr) {
        return res.status(500).json({ ok: false, error: "Failed to insert items", details: insErr.message });
      }
    }

    const { data: freshItems, error: freshErr } = await supabaseAdmin
      .from("quote_items")
      .select("id,quote_id,title,qty,unit_price,sort_order,created_at,updated_at")
      .eq("quote_id", quote_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (freshErr) {
      return res.status(500).json({ ok: false, error: "Failed to load items", details: freshErr.message });
    }

    const total = (freshItems || []).reduce(
      (sum, it) => sum + Number(it.qty ?? 0) * Number(it.unit_price ?? 0),
      0
    );

    const { data: updatedQuote, error: updateErr } = await supabaseAdmin
      .from("quotes")
      .update({
        total_amount: total,
        total_price_gbp: total,
        quote_text,
        updated_at: nowIso,
        updated_by_user: userId,
      })
      .eq("id", quote_id)
      .select("*")
      .single();

    if (updateErr) {
      return res.status(500).json({ ok: false, error: "Failed to update quote", details: updateErr.message });
    }

    await supabaseAdmin
      .from("suppliers")
      .update({ last_active_at: nowIso })
      .eq("id", supplier.id);

    return res.status(200).json({
      ok: true,
      quote: updatedQuote,
      items: freshItems || [],
      total,
    });
  } catch (err) {
    console.error("supplier-save-draft-quote crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}
