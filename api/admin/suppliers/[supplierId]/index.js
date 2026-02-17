import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../../../_lib/adminAuth.js";
import { UUID_RE, parseBody } from "../../../message-utils.js";
import { fetchFhrsEstablishment, parseFsaUrl } from "../../../_lib/fsa.js";

function trimText(value, max = 4000) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function toBool(value) {
  if (value === true || value === false) return value;
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (["true", "1", "yes", "y", "on"].includes(v)) return true;
  if (["false", "0", "no", "n", "off"].includes(v)) return false;
  return null;
}

async function refreshFsaRating(admin, supplierId, establishmentId) {
  const fetched = await fetchFhrsEstablishment(establishmentId);
  const update = await admin
    .from("suppliers")
    .update({
      fsa_rating_value: fetched.ratingValue,
      fsa_rating_date: fetched.ratingDate,
      fsa_rating_last_fetched_at: fetched.lastFetchedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId)
    .select(
      "id,business_name,slug,base_city,base_postcode,description,website_url,instagram_url,public_email,public_phone,is_published,is_verified,is_insured,fsa_rating_url,fsa_establishment_id,fsa_rating_value,fsa_rating_date,fsa_rating_last_fetched_at,credits_balance,short_description,about,services,location_label,listing_categories,created_at,updated_at"
    )
    .maybeSingle();

  if (update.error) throw update.error;
  return update.data;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireAdmin(req);
    if (!auth.ok) return res.status(auth.code).json({ ok: false, error: auth.error, details: auth.details });

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing server env vars",
        details: {
          SUPABASE_URL_or_VITE_SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
        },
      });
    }

    const supplierId = String(req.query?.supplierId || "").trim();
    if (!supplierId || !UUID_RE.test(supplierId)) {
      return res.status(400).json({ ok: false, error: "Bad request", details: "Invalid supplierId" });
    }

    const body = parseBody(req);
    let warning = null;

    // Basic profile fields already present in admin UI.
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, "business_name")) patch.business_name = trimText(body.business_name, 180);
    if (Object.prototype.hasOwnProperty.call(body, "slug")) patch.slug = trimText(body.slug, 160);
    if (Object.prototype.hasOwnProperty.call(body, "base_city")) patch.base_city = trimText(body.base_city, 120);
    if (Object.prototype.hasOwnProperty.call(body, "base_postcode")) patch.base_postcode = trimText(body.base_postcode, 24);
    if (Object.prototype.hasOwnProperty.call(body, "description")) patch.description = trimText(body.description, 4000);
    if (Object.prototype.hasOwnProperty.call(body, "website_url")) patch.website_url = trimText(body.website_url, 300);
    if (Object.prototype.hasOwnProperty.call(body, "instagram_url")) patch.instagram_url = trimText(body.instagram_url, 300);
    if (Object.prototype.hasOwnProperty.call(body, "public_email")) patch.public_email = trimText(body.public_email, 160);
    if (Object.prototype.hasOwnProperty.call(body, "public_phone")) patch.public_phone = trimText(body.public_phone, 50);

    // Public listing fields (parity with supplier panel).
    if (Object.prototype.hasOwnProperty.call(body, "short_description")) patch.short_description = trimText(body.short_description, 160);
    if (Object.prototype.hasOwnProperty.call(body, "about")) patch.about = trimText(body.about, 4000);
    if (Object.prototype.hasOwnProperty.call(body, "location_label")) patch.location_label = trimText(body.location_label, 120);

    // arrays are handled by a dedicated listing endpoint; avoid half-valid writes here.

    const isPublished = toBool(body?.is_published);
    if (Object.prototype.hasOwnProperty.call(body, "is_published") && isPublished !== null) patch.is_published = isPublished;
    const isVerified = toBool(body?.is_verified);
    if (Object.prototype.hasOwnProperty.call(body, "is_verified") && isVerified !== null) patch.is_verified = isVerified;
    if (Object.prototype.hasOwnProperty.call(body, "is_insured") || Object.prototype.hasOwnProperty.call(body, "isInsured")) {
      const insured = toBool(Object.prototype.hasOwnProperty.call(body, "isInsured") ? body.isInsured : body.is_insured);
      if (insured !== null) patch.is_insured = insured;
    }

    if (Object.prototype.hasOwnProperty.call(body, "fsa_rating_url") || Object.prototype.hasOwnProperty.call(body, "fsaRatingUrl")) {
      const rawUrl = Object.prototype.hasOwnProperty.call(body, "fsaRatingUrl") ? body.fsaRatingUrl : body.fsa_rating_url;
      const parsedFsa = parseFsaUrl(rawUrl);
      if (parsedFsa?.error) {
        return res.status(400).json({ ok: false, error: "Bad request", details: parsedFsa.error });
      }

      patch.fsa_rating_url = parsedFsa.url;
      patch.fsa_establishment_id = parsedFsa.establishmentId;
      if (!parsedFsa.url) {
        patch.fsa_rating_value = null;
        patch.fsa_rating_date = null;
        patch.fsa_rating_last_fetched_at = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "updated_by_user_id")) {
      const u = trimText(body.updated_by_user_id, 80);
      patch.updated_by_user_id = u;
    }

    // Safety: avoid writing an empty patch.
    const keys = Object.keys(patch);
    if (keys.length === 0) return res.status(400).json({ ok: false, error: "Bad request", details: "No fields provided" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const updated = await admin
      .from("suppliers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", supplierId)
      .select(
        "id,business_name,slug,base_city,base_postcode,description,website_url,instagram_url,public_email,public_phone,is_published,is_verified,is_insured,fsa_rating_url,fsa_establishment_id,fsa_rating_value,fsa_rating_date,fsa_rating_last_fetched_at,credits_balance,short_description,about,services,location_label,listing_categories,created_at,updated_at"
      )
      .maybeSingle();

    if (updated.error) {
      return res.status(500).json({ ok: false, error: "Failed to update supplier", details: updated.error.message });
    }
    if (!updated.data) return res.status(404).json({ ok: false, error: "Supplier not found" });

    let supplier = updated.data;
    if (supplier.fsa_establishment_id) {
      try {
        const refreshed = await refreshFsaRating(admin, supplierId, supplier.fsa_establishment_id);
        if (refreshed) supplier = refreshed;
      } catch (err) {
        warning = `Saved, but FHRS refresh failed: ${String(err?.message || err)}`;
      }
    }

    return res.status(200).json({ ok: true, supplier, warning });
  } catch (err) {
    console.error("admin supplier patch crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
