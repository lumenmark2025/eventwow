function safeText(value) {
  return String(value || "").trim();
}

function messagePreview(message, max = 180) {
  const text = safeText(message);
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function buildBudget(enquiry) {
  const amountRaw = enquiry?.budget_amount;
  const amount = amountRaw === null || amountRaw === undefined ? null : Number(amountRaw);
  const unit = safeText(enquiry?.budget_unit).toLowerCase() || null;
  const range = safeText(enquiry?.budget_range) || null;

  let label = null;
  if (Number.isFinite(amount) && amount > 0) {
    const money = `£${amount.toLocaleString("en-GB", {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
    label = unit === "per_person" ? `${money} per person` : `${money} in total`;
  } else if (range) {
    label = range;
  }

  return {
    amount: Number.isFinite(amount) ? amount : null,
    unit: unit === "per_person" || unit === "in_total" ? unit : null,
    range,
    label,
  };
}

export function buildVenue(enquiry) {
  const venue = enquiry?.venues || null;
  return {
    name: safeText(venue?.name) || safeText(enquiry?.venue_name) || null,
    address: safeText(venue?.address) || null,
    locationLabel:
      safeText(venue?.location_label) ||
      safeText(enquiry?.location_label) ||
      safeText(enquiry?.venue_postcode) ||
      safeText(enquiry?.event_postcode) ||
      null,
  };
}

export function buildSupplierEnquiryDto(enquiry) {
  const budget = buildBudget(enquiry);
  const venue = buildVenue(enquiry);
  const customerName =
    safeText(enquiry?.customer_name) || safeText(enquiry?.customers?.full_name) || "Customer";
  const message = safeText(enquiry?.message) || safeText(enquiry?.notes) || null;

  return {
    id: enquiry.id,
    status: enquiry.status || null,
    eventDate: enquiry.event_date || null,
    startTime: enquiry.start_time || enquiry.event_time || null,
    guestCount: enquiry.guest_count ?? null,
    customerName,
    customerEmail: safeText(enquiry?.customer_email) || null,
    categoryLabel: safeText(enquiry?.category_label) || safeText(enquiry?.enquiry_category_slug) || null,
    budget,
    venue,
    locationLabel: venue.locationLabel,
    message,
    shortMessagePreview: messagePreview(message),
    createdAt: enquiry.created_at || null,
  };
}
