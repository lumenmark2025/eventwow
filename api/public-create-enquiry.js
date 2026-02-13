import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { computeSupplierGateFromData } from "./_lib/supplierGate.js";
import { createSupplierNotification, reserveEvent } from "./_lib/notifications.js";

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const rateMap = new Map();

function parseBody(req) {
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

function sanitizeText(value, max = 4000) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function getRateKey(req, email) {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";
  return `${ip}:${String(email || "").toLowerCase()}`;
}

function isRateLimited(key) {
  const now = Date.now();
  const bucket = rateMap.get(key) || [];
  const fresh = bucket.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) {
    rateMap.set(key, fresh);
    return true;
  }
  fresh.push(now);
  rateMap.set(key, fresh);
  return false;
}

function pickEligibleSuppliers(suppliers, imagesBySupplier, categoryLabel, locationLabel, limit = 10) {
  const categoryNeedle = String(categoryLabel || "").trim().toLowerCase();
  const locationNeedle = String(locationLabel || "").trim().toLowerCase();

  const eligible = [];
  for (const supplier of suppliers || []) {
    const images = imagesBySupplier.get(supplier.id) || [];
    const gate = computeSupplierGateFromData({ supplier, images });
    if (!gate.canPublish) continue;

    const categories = Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [];
    if (categoryNeedle) {
      const catMatch = categories.some((c) => String(c || "").trim().toLowerCase() === categoryNeedle);
      if (!catMatch) continue;
    }

    if (locationNeedle) {
      const hay = [
        supplier.location_label,
        supplier.base_city,
        supplier.base_postcode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay && !hay.includes(locationNeedle)) continue;
    }

    eligible.push(supplier);
  }

  return eligible.slice(0, limit);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

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

    const body = parseBody(req);
    const customerName = sanitizeText(body.customerName, 120);
    const customerEmail = sanitizeText(body.customerEmail, 160)?.toLowerCase();
    const customerPhone = sanitizeText(body.customerPhone, 50);
    const eventDate = sanitizeText(body.eventDate, 20);
    const eventTime = sanitizeText(body.eventTime, 40);
    const locationLabel = sanitizeText(body.locationLabel, 160);
    const postcode = sanitizeText(body.postcode, 24);
    const guestCount = Number(body.guestCount || 0);
    const categoryLabel = sanitizeText(body.categoryId || body.categoryLabel, 80);
    const message = sanitizeText(body.message, 2000);

    if (!customerName || !customerEmail || !locationLabel) {
      return res.status(400).json({
        ok: false,
        error: "Bad request",
        details: "customerName, customerEmail, and locationLabel are required",
      });
    }

    const rateKey = getRateKey(req, customerEmail);
    if (isRateLimited(rateKey)) {
      return res.status(429).json({ ok: false, error: "Too many requests", details: "Please try again shortly." });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    let customerId = null;
    const existingCustomerResp = await admin
      .from("customers")
      .select("id")
      .eq("email", customerEmail)
      .maybeSingle();

    if (existingCustomerResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to look up customer",
        details: existingCustomerResp.error.message,
      });
    }

    if (existingCustomerResp.data?.id) {
      customerId = existingCustomerResp.data.id;
      await admin
        .from("customers")
        .update({
          full_name: customerName,
          phone: customerPhone,
        })
        .eq("id", customerId);
    } else {
      const createCustomerResp = await admin
        .from("customers")
        .insert([
          {
            full_name: customerName,
            email: customerEmail,
            phone: customerPhone,
            preferred_contact_method: customerPhone ? "phone" : "email",
          },
        ])
        .select("id")
        .single();

      if (createCustomerResp.error) {
        return res.status(500).json({
          ok: false,
          error: "Failed to create customer",
          details: createCustomerResp.error.message,
        });
      }
      customerId = createCustomerResp.data.id;
    }

    const publicToken = crypto.randomUUID();
    const enquiryInsertResp = await admin
      .from("enquiries")
      .insert([
        {
          customer_id: customerId,
          status: "new",
          event_date: eventDate || null,
          event_postcode: postcode || null,
          guest_count: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : null,
          notes: message,
          match_source: "website",
          created_by_user_id: null,
          updated_by_user_id: null,
          public_token: publicToken,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          event_time: eventTime,
          location_label: locationLabel,
          postcode: postcode,
          category_label: categoryLabel,
          message,
        },
      ])
      .select("id,public_token")
      .single();

    if (enquiryInsertResp.error || !enquiryInsertResp.data?.id) {
      return res.status(500).json({
        ok: false,
        error: "Failed to create enquiry",
        details: enquiryInsertResp.error?.message || "Insert failed",
      });
    }

    const enquiryId = enquiryInsertResp.data.id;

    const suppliersResp = await admin
      .from("suppliers")
      .select(
        "id,business_name,listing_categories,location_label,base_city,base_postcode,short_description,about,services,listed_publicly,is_verified,created_at"
      )
      .eq("listed_publicly", true)
      .order("is_verified", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (suppliersResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load suppliers",
        details: suppliersResp.error.message,
      });
    }

    const supplierIds = (suppliersResp.data || []).map((s) => s.id);
    const imagesResp =
      supplierIds.length > 0
        ? await admin
            .from("supplier_images")
            .select("supplier_id,type")
            .in("supplier_id", supplierIds)
        : { data: [], error: null };

    if (imagesResp.error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to load supplier images",
        details: imagesResp.error.message,
      });
    }

    const imagesBySupplier = new Map();
    for (const img of imagesResp.data || []) {
      if (!imagesBySupplier.has(img.supplier_id)) imagesBySupplier.set(img.supplier_id, []);
      imagesBySupplier.get(img.supplier_id).push(img);
    }

    const eligibleSuppliers = pickEligibleSuppliers(
      suppliersResp.data || [],
      imagesBySupplier,
      categoryLabel,
      locationLabel,
      10
    );

    let invites = [];
    if (eligibleSuppliers.length > 0) {
      const inviteRows = eligibleSuppliers.map((supplier) => ({
        enquiry_id: enquiryId,
        supplier_id: supplier.id,
        supplier_status: "invited",
        match_source: "website",
        created_by_user_id: null,
      }));

      const inviteResp = await admin
        .from("enquiry_suppliers")
        .insert(inviteRows)
        .select("id,enquiry_id,supplier_id");

      if (inviteResp.error) {
        return res.status(500).json({
          ok: false,
          error: "Failed to create supplier invites",
          details: inviteResp.error.message,
        });
      }
      invites = inviteResp.data || [];
    }

    for (const invite of invites) {
      const eventKey = `enquiry_invite:${invite.id}`;
      const lock = await reserveEvent(admin, eventKey, { enquiryId, supplierId: invite.supplier_id });
      if (!lock.ok || !lock.reserved) continue;
      await createSupplierNotification(admin, {
        supplier_id: invite.supplier_id,
        type: "new_enquiry",
        title: "New enquiry",
        body: "A new customer request matches your listing.",
        url: "/supplier/enquiries",
        entity_type: "enquiry",
        entity_id: enquiryId,
      });
    }

    return res.status(200).json({
      ok: true,
      enquiryId,
      publicToken: enquiryInsertResp.data.public_token,
      invitedCount: invites.length,
    });
  } catch (err) {
    console.error("public-create-enquiry crashed:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error", details: String(err?.message || err) });
  }
}
