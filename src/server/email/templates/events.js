import { escapeHtml, renderEmail } from "./baseLayout.js";

function paragraph(text) {
  return `<p style="margin:0 0 10px 0;">${escapeHtml(text)}</p>`;
}

function listItem(text) {
  return `<li style="margin:0 0 6px 0;">${escapeHtml(text)}</li>`;
}

function buildBody({ intro, lines = [] }) {
  const safeIntro = intro ? paragraph(intro) : "";
  const safeLines = lines.filter(Boolean);
  if (!safeLines.length) return safeIntro;

  const rendered = safeLines.map((line) => listItem(line)).join("");
  return `${safeIntro}<ul style="margin:0 0 0 18px;padding:0;">${rendered}</ul>`;
}

function makeTemplate({ subject, metaTitle, headline, intro, lines = [], ctaLabel, ctaUrl, footerNote }) {
  const rendered = renderEmail({
    metaTitle: metaTitle || "Eventwow notification",
    headline,
    bodyHtml: buildBody({ intro, lines }),
    ctaLabel,
    ctaUrl,
    footerNote,
  });
  return { subject, html: rendered.html, text: rendered.text };
}

export function customerEnquiryCreatedEmail({ customerName, enquiryUrl }) {
  return makeTemplate({
    subject: "Eventwow: We've received your enquiry",
    metaTitle: "Enquiry confirmation",
    headline: "We've received your enquiry",
    intro: `Hi ${customerName || "there"}, your enquiry is now live in Eventwow.`,
    lines: ["Suppliers will respond with personalised quotes as they review your request."],
    ctaLabel: "View your enquiry",
    ctaUrl: enquiryUrl,
  });
}

export function customerQuoteMadeEmail({ supplierName, quoteUrl }) {
  return makeTemplate({
    subject: `Eventwow: New quote from ${supplierName || "a supplier"}`,
    metaTitle: "New quote",
    headline: "A new quote is ready",
    intro: `${supplierName || "A supplier"} has sent you a quote.`,
    lines: ["Review the latest breakdown and decide when you're ready."],
    ctaLabel: "View quote",
    ctaUrl: quoteUrl,
  });
}

export function customerMessageFromSupplierEmail({ supplierName, preview, quoteUrl }) {
  return makeTemplate({
    subject: `Eventwow: New message from ${supplierName || "your supplier"}`,
    metaTitle: "New supplier message",
    headline: "You have a new supplier message",
    intro: `${supplierName || "Your supplier"} sent you a message.`,
    lines: preview ? [`Message preview: ${preview}`] : [],
    ctaLabel: "View message",
    ctaUrl: quoteUrl,
  });
}

export function customerQuoteUpdatedEmail({ supplierName, eventSummary, quoteUrl, requiresReacceptance }) {
  return makeTemplate({
    subject: `Eventwow: Quote updated from ${supplierName || "your supplier"} - please review`,
    metaTitle: "Quote updated",
    headline: "Your quote has been updated",
    intro: `${supplierName || "Your supplier"} updated your quote${eventSummary ? ` for ${eventSummary}` : ""}.`,
    lines: [
      requiresReacceptance ? "Please review and accept the updated quote to confirm." : "Please review the latest version.",
    ],
    ctaLabel: "Review updated quote",
    ctaUrl: quoteUrl,
  });
}

export function customerQuoteAcceptedEmail({ supplierName, quoteUrl }) {
  return makeTemplate({
    subject: `Eventwow: Quote accepted from ${supplierName || "your supplier"} - next steps`,
    metaTitle: "Quote accepted",
    headline: "Quote accepted",
    intro: "Your acceptance has been recorded.",
    lines: ["You can review your quote details and continue planning."],
    ctaLabel: "View quote",
    ctaUrl: quoteUrl,
  });
}

export function supplierNewEnquiryEmail({ customerName, town, enquiryUrl }) {
  return makeTemplate({
    subject: `Eventwow: New enquiry in ${town || "your area"} from ${customerName || "a customer"}`,
    metaTitle: "New enquiry",
    headline: "New enquiry received",
    intro: "A new customer enquiry matches your listing.",
    lines: [customerName ? `Customer: ${customerName}` : null, town ? `Area: ${town}` : null].filter(Boolean),
    ctaLabel: "View request",
    ctaUrl: enquiryUrl,
  });
}

export function supplierQuoteSentConfirmationEmail({ customerName, quoteUrl }) {
  return makeTemplate({
    subject: `Eventwow: Quote sent to ${customerName || "customer"}`,
    metaTitle: "Quote sent",
    headline: "Quote sent",
    intro: "Your quote was sent successfully.",
    lines: [customerName ? `Customer: ${customerName}` : null].filter(Boolean),
    ctaLabel: "View quote",
    ctaUrl: quoteUrl,
  });
}

export function supplierQuoteViewedEmail({ customerName, quoteUrl }) {
  return makeTemplate({
    subject: `Eventwow: Your quote for ${customerName || "customer"} was viewed`,
    metaTitle: "Quote viewed",
    headline: "Quote viewed",
    intro: "Your customer opened the quote.",
    lines: ["Consider following up with a message if you'd like to confirm details."],
    ctaLabel: "View quote",
    ctaUrl: quoteUrl,
  });
}

export function supplierMessageFromCustomerEmail({ customerName, preview, threadUrl }) {
  return makeTemplate({
    subject: `Eventwow: New message from ${customerName || "customer"}`,
    metaTitle: "New customer message",
    headline: "You have a new customer message",
    intro: `${customerName || "A customer"} sent a new message.`,
    lines: preview ? [`Message preview: ${preview}`] : [],
    ctaLabel: "Reply",
    ctaUrl: threadUrl,
  });
}

export function supplierQuoteUpdatedConfirmationEmail({ customerName, quoteUrl, requiresReacceptance }) {
  return makeTemplate({
    subject: "Eventwow: Quote updated",
    metaTitle: "Quote updated",
    headline: "Quote updated",
    intro: `Your quote${customerName ? ` for ${customerName}` : ""} has been updated.`,
    lines: [requiresReacceptance ? "Customer will need to re-accept this updated quote." : null].filter(Boolean),
    ctaLabel: "View updated quote",
    ctaUrl: quoteUrl,
  });
}

export function supplierQuoteAcceptedEmail({ customerName, quoteUrl }) {
  return makeTemplate({
    subject: `Eventwow: Quote accepted from ${customerName || "customer"} - confirm details`,
    metaTitle: "Quote accepted",
    headline: "Quote accepted",
    intro: `${customerName || "A customer"} accepted your quote.`,
    lines: ["Review the latest quote and continue with next steps."],
    ctaLabel: "View quote",
    ctaUrl: quoteUrl,
  });
}

export function venueClaimRequestLinkEmail({ requesterName, venueName, claimUrl }) {
  return makeTemplate({
    subject: "Eventwow: Confirm your venue claim request",
    metaTitle: "Venue claim request",
    headline: "Venue claim request received",
    intro: `Hi ${requesterName || "there"}, verify your claim request for ${venueName || "your venue"}.`,
    lines: ["This verification link expires in 7 days.", "Admin approval is still required before access is granted."],
    ctaLabel: "Verify claim request",
    ctaUrl: claimUrl,
  });
}

export function venueClaimApprovedEmail({ requesterName, venueName, loginUrl }) {
  return makeTemplate({
    subject: "Eventwow: Your venue claim was approved",
    metaTitle: "Venue claim approved",
    headline: "Venue claim approved",
    intro: `Hi ${requesterName || "there"}, your claim for ${venueName || "the venue"} has been approved.`,
    lines: ["Sign in to access venue controls."],
    ctaLabel: "Open Eventwow",
    ctaUrl: loginUrl,
  });
}

export function venueClaimRejectedEmail({ requesterName, venueName, contactUrl }) {
  return makeTemplate({
    subject: "Eventwow: Update on your venue claim request",
    metaTitle: "Venue claim update",
    headline: "Venue claim not approved",
    intro: `Hi ${requesterName || "there"}, we could not approve your claim for ${venueName || "the venue"} yet.`,
    lines: ["If you believe this is incorrect, contact support with ownership details."],
    ctaLabel: "Contact support",
    ctaUrl: contactUrl,
  });
}

export function supplierSignupMagicLinkEmail({ businessName, actionUrl }) {
  return makeTemplate({
    subject: "Eventwow: Your supplier login link",
    metaTitle: "Supplier login link",
    headline: "Welcome to Eventwow",
    intro: `Your supplier account${businessName ? ` for ${businessName}` : ""} is ready.`,
    lines: ["You start with 25 free credits.", "Complete your profile before going live."],
    ctaLabel: "Continue onboarding",
    ctaUrl: actionUrl,
  });
}
