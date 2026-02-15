import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { computeSupplierGateFromData } from "./supplierGate.js";
import { createSupplierNotification, reserveEvent } from "./notifications.js";
import { sendEmail } from "./email.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const rateMap = new Map();
const EVENT_TYPES = new Set(["wedding", "corporate", "birthday", "festival", "school", "other"]);
const CONTACT_PREFERENCES = new Set(["email", "phone", "whatsapp"]);
const URGENCY_VALUES = new Set(["flexible", "soon", "urgent"]);
const INDOOR_OUTDOOR_VALUES = new Set(["indoor", "outdoor", "mixed", "unknown"]);
const HIGH_REQUIREMENT_EVENT_TYPES = new Set(["wedding", "corporate", "festival"]);

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

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

function publicAppOrigin() {
  const explicit =
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    process.env.VITE_SITE_URL ||
    "";
  if (explicit) return String(explicit).replace(/\/+$/, "");
  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "";
}

function callbackUrlForMagicLink() {
  const origin = publicAppOrigin();
  return origin ? `${origin}/auth/callback` : null;
}

function sanitizeText(value, max = 4000) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizePostcode(value) {
  const raw = sanitizeText(value, 24);
  if (!raw) return null;
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

function toBool(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function parseGuestCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function looksLikeRepeatedChars(text) {
  return /(.)\1{11,}/i.test(String(text || ""));
}

function looksLikeContactOnly(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const letters = value.replace(/[^a-z]/gi, "").length;
  const digits = value.replace(/[^0-9]/g, "").length;
  const emailLike = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
  const phoneLike = /\+?[0-9][0-9\s().-]{6,}/.test(value);
  return letters < 20 && (emailLike || phoneLike || digits > 9);
}

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getRateKey(req, email) {
  return `${getRequestIp(req)}:${String(email || "").toLowerCase()}`;
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

function daysUntil(dateText) {
  if (!dateText) return null;
  const dt = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const target = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  return Math.floor((target - start) / (24 * 60 * 60 * 1000));
}

function categoryFromLabel(labelOrSlug) {
  return normalizeSlug(labelOrSlug);
}

function categoryLabelFromSlug(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return normalized
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeEnquiryInput(req, body) {
  const fullName = sanitizeText(body.full_name || body.customerName, 120);
  const email = sanitizeText(body.email || body.customerEmail, 160)?.toLowerCase();
  const phone = sanitizeText(body.phone || body.customerPhone, 50);

  const eventTypeRaw = sanitizeText(body.event_type, 40);
  const eventType = eventTypeRaw ? eventTypeRaw.toLowerCase() : null;

  const enquiryCategorySlug = categoryFromLabel(
    body.enquiry_category_slug || body.categorySlug || body.categoryId || body.categoryLabel
  );
  const eventDate = sanitizeText(body.event_date || body.eventDate, 20);
  const startTime = sanitizeText(body.start_time || body.eventTime, 20);
  const guestCount = parseGuestCount(body.guest_count ?? body.guestCount);
  const budgetRange = sanitizeText(body.budget_range || body.budgetRange, 40);
  const venueKnown = toBool(body.venue_known ?? body.venueKnown) ?? false;
  const venueName = sanitizeText(body.venue_name || body.venueName || body.locationLabel, 160);
  const venuePostcode = normalizePostcode(body.venue_postcode || body.postcode || body.venuePostcode);
  const indoorOutdoorRaw = sanitizeText(body.indoor_outdoor || body.indoorOutdoor, 24);
  const indoorOutdoor = indoorOutdoorRaw ? indoorOutdoorRaw.toLowerCase() : null;
  const powerAvailable = toBool(body.power_available ?? body.powerAvailable);
  const dietaryRequirements = sanitizeText(body.dietary_requirements || body.dietarySummary, 1000);
  const contactPreferenceRaw = sanitizeText(body.contact_preference || body.contactPreference, 20);
  const contactPreference = contactPreferenceRaw ? contactPreferenceRaw.toLowerCase() : null;
  const urgencyRaw = sanitizeText(body.urgency, 20);
  const urgency = urgencyRaw ? urgencyRaw.toLowerCase() : null;
  const message = sanitizeText(body.message || body.notes, 4000);

  const sourcePage = sanitizeText(body.source_page || body.sourcePage || req.headers.referer, 300);
  const supplierId = sanitizeText(body.supplier_id || body.supplierId, 64);
  const venueId = sanitizeText(body.venue_id || body.venueId, 64);

  let structuredAnswers = body.structured_answers ?? body.structuredAnswers ?? {};
  if (typeof structuredAnswers === "string") {
    try {
      structuredAnswers = JSON.parse(structuredAnswers || "{}");
    } catch {
      structuredAnswers = {};
    }
  }
  if (!structuredAnswers || typeof structuredAnswers !== "object" || Array.isArray(structuredAnswers)) {
    structuredAnswers = {};
  }

  if (!Object.prototype.hasOwnProperty.call(structuredAnswers, "serving_time_window")) {
    const servingTimeWindow = sanitizeText(body.serving_time_window || body.servingTimeWindow, 120);
    if (servingTimeWindow) structuredAnswers.serving_time_window = servingTimeWindow;
  }
  if (!Object.prototype.hasOwnProperty.call(structuredAnswers, "access_notes")) {
    const accessNotes = sanitizeText(body.access_notes || body.accessNotes, 400);
    if (accessNotes) structuredAnswers.access_notes = accessNotes;
  }

  return {
    fullName,
    email,
    phone,
    eventType,
    enquiryCategorySlug,
    eventDate,
    startTime,
    guestCount,
    budgetRange,
    venueKnown,
    venueName,
    venuePostcode,
    indoorOutdoor,
    powerAvailable,
    dietaryRequirements,
    contactPreference,
    urgency,
    message,
    structuredAnswers,
    sourcePage,
    supplierId,
    venueId,
  };
}

function validateAndScoreEnquiry(input) {
  const flags = [];
  const errors = [];
  const hints = [];

  if (!input.fullName) errors.push("Full name is required.");
  if (!input.email) errors.push("Email is required.");

  if (input.eventType && !EVENT_TYPES.has(input.eventType)) {
    errors.push("event_type is invalid.");
  }
  if (input.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) {
    errors.push("event_date is invalid.");
  }
  if (input.startTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(input.startTime)) {
    errors.push("start_time is invalid.");
  }
  if (input.contactPreference && !CONTACT_PREFERENCES.has(input.contactPreference)) {
    errors.push("contact_preference is invalid.");
  }
  if (input.urgency && !URGENCY_VALUES.has(input.urgency)) {
    errors.push("urgency is invalid.");
  }
  if (input.indoorOutdoor && !INDOOR_OUTDOOR_VALUES.has(input.indoorOutdoor)) {
    errors.push("indoor_outdoor is invalid.");
  }

  const messageLength = String(input.message || "").trim().length;
  if (messageLength < 80) {
    flags.push("too_short");
    errors.push("Message must be at least 80 characters.");
    hints.push("Add more detail about guest numbers, venue, timings, and what service you need.");
  }

  const hasCoreDetail =
    !!input.guestCount || !!input.eventDate || !!input.venueName || !!input.venuePostcode || !!input.budgetRange;
  if (!hasCoreDetail) {
    flags.push("low_detail");
    errors.push("Add at least one core detail: guest count, event date, venue info, or budget range.");
    hints.push("Include at least one of guest count, event date, venue name/postcode, or budget.");
  }

  if (looksLikeRepeatedChars(input.message)) {
    flags.push("repeated_chars");
    errors.push("Message looks invalid. Please remove repeated characters.");
  }
  if (looksLikeContactOnly(input.message)) {
    flags.push("contact_only");
    errors.push("Message cannot be contact details only.");
    hints.push("Explain your event needs, not just contact information.");
  }

  if (input.venueKnown && !input.venueName && !input.venuePostcode) {
    flags.push("missing_venue");
    errors.push("When venue is known, provide venue name or venue postcode.");
    hints.push("Add venue name or postcode.");
  }

  if (input.eventType && HIGH_REQUIREMENT_EVENT_TYPES.has(input.eventType) && !input.guestCount) {
    flags.push("missing_guest_count");
    errors.push("Guest count is required for this event type.");
    hints.push("Add an estimated guest count.");
  }

  if (!input.eventDate) {
    flags.push("missing_date");
    hints.push("Add an event date if known.");
  }
  if (!input.guestCount) {
    flags.push("missing_guest_count");
    hints.push("Add expected guest count.");
  }
  if (!input.venueName && !input.venuePostcode) {
    flags.push("missing_venue");
    hints.push("Add venue name or postcode.");
  }
  if (!input.budgetRange) {
    flags.push("missing_budget");
    hints.push("Add a budget range so suppliers can tailor quotes.");
  }

  if (input.enquiryCategorySlug === "pizza-catering" && input.powerAvailable === null) {
    hints.push("For pizza catering, mention whether power is available at the venue.");
  }

  let normalizedUrgency = input.urgency || null;
  const days = daysUntil(input.eventDate);
  if (!normalizedUrgency && days !== null && days >= 0 && days <= 14) {
    normalizedUrgency = "urgent";
  }

  let score = 100;
  if (messageLength < 120) score -= 10;
  if (!input.guestCount) score -= 12;
  if (!input.eventDate) score -= 12;
  if (!input.venueName && !input.venuePostcode) score -= 12;
  if (!input.budgetRange) score -= 8;
  if (!input.dietaryRequirements) score -= 4;
  if (looksLikeRepeatedChars(input.message)) score -= 35;
  if (looksLikeContactOnly(input.message)) score -= 45;
  if (!input.structuredAnswers?.serving_time_window) score -= 7;
  if (!input.structuredAnswers?.access_notes) score -= 6;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    ok: errors.length === 0,
    errors,
    hints: Array.from(new Set(hints)).slice(0, 6),
    flags: Array.from(new Set(flags)),
    score,
    normalizedUrgency,
  };
}

function pickEligibleSuppliers(
  suppliers,
  imagesBySupplier,
  categorySlug,
  locationNeedle,
  limit = 10
) {
  const normalizedCategory = normalizeSlug(categorySlug);
  const normalizedLocation = String(locationNeedle || "").trim().toLowerCase();
  const eligible = [];

  for (const supplier of suppliers || []) {
    const images = imagesBySupplier.get(supplier.id) || [];
    const gate = computeSupplierGateFromData({ supplier, images });
    if (!gate.canPublish) continue;

    if (normalizedCategory) {
      const categories = Array.isArray(supplier.listing_categories) ? supplier.listing_categories : [];
      const categoryMatch = categories.some((c) => normalizeSlug(c) === normalizedCategory);
      if (!categoryMatch) continue;
    }

    if (normalizedLocation) {
      const hay = [supplier.location_label, supplier.base_city, supplier.base_postcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay && !hay.includes(normalizedLocation)) continue;
    }

    eligible.push(supplier);
  }

  return eligible.slice(0, limit);
}

async function getAuthUserFromToken({ supabaseUrl, anonKey, token }) {
  if (!token || !supabaseUrl || !anonKey) return null;
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await authed.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function resolveUserRole(admin, userId) {
  if (!userId) return null;

  const profile = await admin.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  if (!profile.error && profile.data?.role) return String(profile.data.role).toLowerCase();

  const legacyAdmin = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!legacyAdmin.error && legacyAdmin.data?.role) return "admin";

  const supplier = await admin.from("suppliers").select("id").eq("auth_user_id", userId).maybeSingle();
  if (!supplier.error && supplier.data?.id) return "supplier";

  const customer = await admin.from("customers").select("id").eq("user_id", userId).maybeSingle();
  if (!customer.error && customer.data?.id) return "customer";

  return null;
}

async function upsertUserProfileRole(admin, userId, role) {
  if (!userId || !role) return;
  await admin.from("user_profiles").upsert(
    {
      user_id: userId,
      role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

async function upsertCustomerLinkedToUser(admin, { userId, fullName, email, phone, contactPreference }) {
  if (!userId) return null;

  const byUser = await admin.from("customers").select("id").eq("user_id", userId).maybeSingle();
  if (!byUser.error && byUser.data?.id) {
    await admin
      .from("customers")
      .update({
        full_name: fullName,
        email,
        phone,
        preferred_contact_method: contactPreference || (phone ? "phone" : "email"),
      })
      .eq("id", byUser.data.id);
    return byUser.data.id;
  }

  const createResp = await admin
    .from("customers")
    .insert([
      {
        user_id: userId,
        full_name: fullName,
        email,
        phone,
        preferred_contact_method: contactPreference || (phone ? "phone" : "email"),
      },
    ])
    .select("id")
    .single();

  if (createResp.error || !createResp.data?.id) return null;
  return createResp.data.id;
}

async function findAuthUserIdByEmail(admin, email) {
  const rpc = await admin.rpc("find_auth_user_by_email", { p_email: email });
  if (rpc.error) return null;
  return typeof rpc.data === "string" && rpc.data ? rpc.data : null;
}

async function sendCustomerMagicLinkEmail(admin, email, fullName) {
  if (!email) return { ok: false };
  const redirectTo = callbackUrlForMagicLink();
  const linkResp = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (linkResp.error || !linkResp.data?.properties?.action_link) {
    return { ok: false, error: linkResp.error?.message || "Failed to generate magic link" };
  }

  const actionLink = linkResp.data.properties.action_link;
  await sendEmail({
    to: email,
    subject: "Manage your Eventwow enquiries",
    html: `
      <p>Hi ${String(fullName || "").trim() || "there"},</p>
      <p>Your enquiry was received. Use the secure link below to manage your enquiries:</p>
      <p><a href="${actionLink}">Continue to your Eventwow dashboard</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
    eventKey: "customer_magic_link",
  });

  return { ok: true };
}

export async function handleCreatePublicEnquiry(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
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
    const input = normalizeEnquiryInput(req, body);
    const quality = validateAndScoreEnquiry(input);

    if (!quality.ok) {
      return res.status(400).json({
        ok: false,
        error: "Validation failed",
        details: quality.errors.join(" "),
        hints: quality.hints,
        flags: quality.flags,
      });
    }

    const rateKey = getRateKey(req, input.email);
    if (isRateLimited(rateKey)) {
      return res.status(429).json({
        ok: false,
        error: "Too many requests",
        details: "Please try again shortly.",
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const token = getBearerToken(req);
    const authUser = await getAuthUserFromToken({ supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, token });
    let linkedCustomerId = null;
    let linkedCustomerUserId = null;

    if (authUser?.id) {
      const role = await resolveUserRole(admin, authUser.id);
      if (role === "customer") {
        linkedCustomerUserId = authUser.id;
        linkedCustomerId = await upsertCustomerLinkedToUser(admin, {
          userId: authUser.id,
          fullName: input.fullName,
          email: authUser.email || input.email,
          phone: input.phone,
          contactPreference: input.contactPreference,
        });
      }
    } else {
      const existingUserId = await findAuthUserIdByEmail(admin, input.email);

      if (!existingUserId) {
        const createUserResp = await admin.auth.admin.createUser({
          email: input.email,
          email_confirm: false,
          user_metadata: { full_name: input.fullName || null },
        });
        if (!createUserResp.error && createUserResp.data?.user?.id) {
          linkedCustomerUserId = createUserResp.data.user.id;
          await upsertUserProfileRole(admin, linkedCustomerUserId, "customer");
          linkedCustomerId = await upsertCustomerLinkedToUser(admin, {
            userId: linkedCustomerUserId,
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            contactPreference: input.contactPreference,
          });
          await sendCustomerMagicLinkEmail(admin, input.email, input.fullName);
        }
      } else {
        const existingRole = await resolveUserRole(admin, existingUserId);
        const isPrivileged = existingRole === "admin" || existingRole === "supplier" || existingRole === "venue";
        if (!isPrivileged) {
          linkedCustomerUserId = existingUserId;
          await upsertUserProfileRole(admin, existingUserId, "customer");
          linkedCustomerId = await upsertCustomerLinkedToUser(admin, {
            userId: existingUserId,
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            contactPreference: input.contactPreference,
          });
        }
        await sendCustomerMagicLinkEmail(admin, input.email, input.fullName);
      }
    }
    const publicToken = crypto.randomUUID();
    const ipHash = crypto.createHash("sha256").update(getRequestIp(req)).digest("hex");

    let resolvedVenueName = input.venueName || null;
    let resolvedVenueId = null;
    let resolvedVenueLocationLabel = null;
    if (input.venueId && UUID_RE.test(input.venueId)) {
      const venueResp = await admin
        .from("venues")
        .select("id,name,location_label,is_published")
        .eq("id", input.venueId)
        .eq("is_published", true)
        .maybeSingle();
      if (venueResp.error) {
        return res.status(500).json({ ok: false, error: "Failed to validate venue", details: venueResp.error.message });
      }
      if (!venueResp.data?.id) {
        return res.status(400).json({ ok: false, error: "Bad request", details: "venue_id is invalid or unpublished" });
      }
      resolvedVenueId = venueResp.data.id;
      resolvedVenueName = venueResp.data.name || resolvedVenueName;
      resolvedVenueLocationLabel = venueResp.data.location_label || null;
    }

    const enquiryInsertResp = await admin
      .from("enquiries")
      .insert([
        {
          customer_id: linkedCustomerId,
          customer_user_id: linkedCustomerUserId,
          status: "new",
          event_type: input.eventType,
          enquiry_category_slug: input.enquiryCategorySlug || null,
          event_date: input.eventDate || null,
          start_time: input.startTime || null,
          guest_count: input.guestCount,
          budget_range: input.budgetRange || null,
          venue_known: !!input.venueKnown || !!resolvedVenueId,
          venue_name: resolvedVenueName,
          venue_postcode: input.venuePostcode || null,
          indoor_outdoor: input.indoorOutdoor || null,
          power_available: input.powerAvailable,
          dietary_requirements: input.dietaryRequirements || null,
          contact_preference: input.contactPreference || null,
          urgency: quality.normalizedUrgency,
          message: input.message,
          message_quality_score: quality.score,
          message_quality_flags: quality.flags,
          structured_answers: input.structuredAnswers || {},
          source_page: input.sourcePage || null,
          created_ip_hash: ipHash,
          match_source: "concierge",
          created_by_user_id: null,
          updated_by_user_id: null,
          public_token: publicToken,
          customer_name: input.fullName,
          customer_email: input.email,
          customer_phone: input.phone,
          event_time: input.startTime || null,
          location_label: resolvedVenueLocationLabel || resolvedVenueName || input.venuePostcode || null,
          venue_id: resolvedVenueId,
          postcode: input.venuePostcode || null,
          event_postcode: input.venuePostcode || null,
          category_label: categoryLabelFromSlug(input.enquiryCategorySlug) || null,
          notes: input.message,
          serving_time_window: sanitizeText(input.structuredAnswers?.serving_time_window, 120),
          dietary_summary: input.dietaryRequirements || null,
          access_notes: sanitizeText(input.structuredAnswers?.access_notes, 400),
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

    const suppliersBaseQuery = admin
      .from("suppliers")
      .select(
        "id,business_name,listing_categories,location_label,base_city,base_postcode,short_description,about,services,is_published,is_verified,created_at"
      )
      .eq("is_published", true);

    const suppliersResp =
      input.supplierId && UUID_RE.test(input.supplierId)
        ? await suppliersBaseQuery.eq("id", input.supplierId).limit(1)
        : await suppliersBaseQuery.order("is_verified", { ascending: false }).order("created_at", { ascending: false }).limit(250);

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
      input.enquiryCategorySlug,
      input.supplierId ? null : resolvedVenueName || input.venuePostcode,
      input.supplierId ? 1 : 10
    );

    if (input.supplierId && eligibleSuppliers.length !== 1) {
      return res.status(409).json({
        ok: false,
        error: "Cannot create enquiry",
        details: "Supplier is not eligible to receive direct requests",
      });
    }

    let invites = [];
    if (eligibleSuppliers.length > 0) {
      const inviteRows = eligibleSuppliers.map((supplier) => ({
        enquiry_id: enquiryId,
        supplier_id: supplier.id,
        supplier_status: "invited",
        match_source: "concierge",
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
      enquiry_id: enquiryId,
      enquiryId,
      publicToken: enquiryInsertResp.data.public_token,
      invitedCount: invites.length,
      message: "Thanks - we have emailed you a link to manage your request.",
    });
  } catch (err) {
    console.error("public enquiries create crashed:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal Server Error",
      details: String(err?.message || err),
    });
  }
}
