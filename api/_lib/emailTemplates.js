export {
  customerEnquiryCreatedEmail,
  customerMessageFromSupplierEmail as messageReceivedEmailToCustomer,
  customerQuoteAcceptedEmail as customerAcceptedConfirmationEmail,
  customerQuoteMadeEmail,
  customerQuoteUpdatedEmail,
  supplierMessageFromCustomerEmail as messageReceivedEmailToSupplier,
  supplierNewEnquiryEmail,
  supplierQuoteAcceptedEmail as quoteAcceptedEmailToSupplier,
  supplierQuoteSentConfirmationEmail as quoteSentEmail,
  supplierQuoteUpdatedConfirmationEmail,
  supplierQuoteViewedEmail,
  venueClaimApprovedEmail,
  venueClaimRejectedEmail,
  venueClaimRequestLinkEmail,
  supplierSignupMagicLinkEmail,
} from "../../src/server/email/templates/events.js";
import { escapeHtml, renderEmail } from "../../src/server/email/templates/baseLayout.js";

export function customerDeclinedConfirmationEmail({ customerName, quoteSummary, publicQuoteUrl }) {
  const bodyHtml = [
    `<p style="margin:0 0 10px 0;">Hi ${escapeHtml(customerName || "there")}, your decline has been recorded.</p>`,
    quoteSummary ? `<p style="margin:0 0 10px 0;">${escapeHtml(quoteSummary)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const rendered = renderEmail({
    metaTitle: "Quote declined",
    headline: "Quote declined",
    bodyHtml,
    ctaLabel: "View your quote",
    ctaUrl: publicQuoteUrl || "https://eventwow.co.uk",
  });

  return {
    subject: "Eventwow: Quote declined",
    text: rendered.text,
    html: rendered.html,
  };
}

export function quoteDeclinedEmailToSupplier({ supplierName, quoteId, customerName, customerEmail, supplierUrl }) {
  const detail = [customerName ? `Customer: ${customerName}` : "", customerEmail ? `Email: ${customerEmail}` : ""]
    .filter(Boolean)
    .join(" | ");

  const bodyHtml = [
    `<p style="margin:0 0 10px 0;">Hi ${escapeHtml(supplierName || "there")}, the quote was declined.</p>`,
    `<p style="margin:0 0 10px 0;">Quote: ${escapeHtml(quoteId)}</p>`,
    detail ? `<p style="margin:0 0 10px 0;">${escapeHtml(detail)}</p>` : "",
  ]
    .filter(Boolean)
    .join("");

  const rendered = renderEmail({
    metaTitle: "Quote declined",
    headline: "Quote declined",
    bodyHtml,
    ctaLabel: "View quote",
    ctaUrl: supplierUrl || "https://eventwow.co.uk",
  });

  return {
    subject: "Eventwow: Quote declined",
    text: rendered.text,
    html: rendered.html,
  };
}
