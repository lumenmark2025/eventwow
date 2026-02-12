import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildPublicUrl(req, token) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  const path = `/quote/${token}`;
  if (!host) return { path, url: path };
  return { path, url: `${proto}://${host}${path}` };
}

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
    if (typeof body === "string") {
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    const quoteId = String(body?.quote_id || body?.quoteId || "").trim();
    if (!quoteId || !UUID_RE.test(quoteId)) {
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
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (supErr) {
      return res.status(500).json({ ok: false, error: "Supplier lookup failed", details: supErr.message });
    }
    if (!supplier) {
      return res.status(409).json({ ok: false, error: "Cannot create link", details: "Supplier not found" });
    }

    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("quotes")
      .select("id,status,supplier_id")
      .eq("id", quoteId)
      .eq("supplier_id", supplier.id)
      .maybeSingle();

    if (quoteErr) {
      return res.status(500).json({ ok: false, error: "Quote lookup failed", details: quoteErr.message });
    }
    if (!quote) {
      return res.status(409).json({ ok: false, error: "Cannot create link", details: "Quote not found for this supplier" });
    }

    const status = String(quote.status || "").toLowerCase();
    if (status === "draft") {
      return res.status(409).json({ ok: false, error: "Cannot create link", details: "Quote must be sent first" });
    }

    let link = null;
    const { data: existing, error: linkErr } = await supabaseAdmin
      .from("quote_public_links")
      .select("id,token")
      .eq("quote_id", quote.id)
      .maybeSingle();

    if (linkErr) {
      return res.status(500).json({ ok: false, error: "Link lookup failed", details: linkErr.message });
    }

    if (existing) {
      link = existing;
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("quote_public_links")
        .insert([
          {
            quote_id: quote.id,
            created_by_user: userId,
          },
        ])
        .select("id,token")
        .single();

      if (insertErr) {
        const isConflict = insertErr.code === "23505";
        if (!isConflict) {
          return res.status(500).json({ ok: false, error: "Failed to create link", details: insertErr.message });
        }

        const { data: conflictExisting, error: conflictErr } = await supabaseAdmin
          .from("quote_public_links")
          .select("id,token")
          .eq("quote_id", quote.id)
          .maybeSingle();

        if (conflictErr || !conflictExisting) {
          return res.status(500).json({ ok: false, error: "Failed to load link", details: conflictErr?.message || "Unknown error" });
        }
        link = conflictExisting;
      } else {
        link = inserted;
      }
    }

    const { path, url } = buildPublicUrl(req, link.token);

    return res.status(200).json({
      ok: true,
      token: link.token,
      path,
      url,
    });
  } catch (err) {
    console.error("supplier-get-public-link crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
