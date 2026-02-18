function wrapTemplate(title, intro, ctaLabel, ctaUrl, lines = []) {
  const list = lines
    .filter(Boolean)
    .map((line) => `<li style="margin: 0 0 6px 0;">${line}</li>`)
    .join("");

  const cta = ctaUrl
    ? `<p style="margin:20px 0;"><a href="${ctaUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;">${ctaLabel || "Open"}</a></p>`
    : "";

  return `
  <div style="background:#f8fafc;padding:24px 12px;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;">
      <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Eventwow</p>
      <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;">${title}</h1>
      <p style="margin:0 0 14px 0;font-size:14px;line-height:1.5;color:#334155;">${intro}</p>
      ${list ? `<ul style="margin:0 0 8px 18px;padding:0;font-size:14px;line-height:1.4;color:#334155;">${list}</ul>` : ""}
      ${cta}
      <p style="margin:14px 0 0 0;font-size:12px;color:#64748b;">This is an automated Eventwow notification.</p>
    </div>
  </div>`;
}

export function quoteSentEmail({ supplierName, quoteId, supplierUrl }) {
  return {
    subject: "Quote sent successfully",
    html: wrapTemplate(
      "Your quote is now live",
      `Hi ${supplierName || "there"}, your quote has been sent to the customer.`,
      "Open quote",
      supplierUrl,
      [`Quote: ${quoteId}`]
    ),
  };
}

export function quoteAcceptedEmailToSupplier({ supplierName, quoteId, customerName, customerEmail, supplierUrl }) {
  return {
    subject: "Great news: your quote was accepted",
    html: wrapTemplate(
      "Quote accepted",
      `Hi ${supplierName || "there"}, a customer accepted your quote.`,
      "View quote",
      supplierUrl,
      [
        `Quote: ${quoteId}`,
        customerName ? `Customer: ${customerName}` : null,
        customerEmail ? `Customer email: ${customerEmail}` : null,
      ]
    ),
  };
}

export function quoteDeclinedEmailToSupplier({ supplierName, quoteId, customerName, customerEmail, supplierUrl }) {
  return {
    subject: "Update: your quote was declined",
    html: wrapTemplate(
      "Quote declined",
      `Hi ${supplierName || "there"}, the customer declined your quote.`,
      "View quote",
      supplierUrl,
      [
        `Quote: ${quoteId}`,
        customerName ? `Customer: ${customerName}` : null,
        customerEmail ? `Customer email: ${customerEmail}` : null,
      ]
    ),
  };
}

export function messageReceivedEmailToSupplier({ supplierName, preview, threadUrl }) {
  return {
    subject: "New customer message",
    html: wrapTemplate(
      "You have a new message",
      `Hi ${supplierName || "there"}, a customer sent a new message.`,
      "Open conversation",
      threadUrl,
      [preview ? `Message preview: ${preview}` : null]
    ),
  };
}

export function messageReceivedEmailToCustomer({ preview, publicQuoteUrl }) {
  return {
    subject: "New supplier message",
    html: wrapTemplate(
      "You have a new message from your supplier",
      "Your supplier has replied in the quote thread.",
      "Open quote",
      publicQuoteUrl,
      [preview ? `Message preview: ${preview}` : null]
    ),
  };
}

export function customerAcceptedConfirmationEmail({ customerName, quoteSummary, publicQuoteUrl }) {
  return {
    subject: "You accepted your quote",
    html: wrapTemplate(
      "Quote accepted",
      `Hi ${customerName || "there"}, your acceptance has been recorded.`,
      "View your quote",
      publicQuoteUrl,
      [quoteSummary || null]
    ),
  };
}

export function customerDeclinedConfirmationEmail({ customerName, quoteSummary, publicQuoteUrl }) {
  return {
    subject: "You declined your quote",
    html: wrapTemplate(
      "Quote declined",
      `Hi ${customerName || "there"}, your decline has been recorded.`,
      "View your quote",
      publicQuoteUrl,
      [quoteSummary || null]
    ),
  };
}

export function venueClaimRequestLinkEmail({ requesterName, venueName, claimUrl }) {
  return {
    subject: "Confirm your Eventwow venue claim request",
    html: wrapTemplate(
      "Venue claim request received",
      `Hi ${requesterName || "there"}, use the secure link below to verify your venue claim request for ${venueName || "your venue"}.`,
      "Verify claim request",
      claimUrl,
      ["Admin approval is still required before you can manage this venue.", "This link expires in 7 days."]
    ),
  };
}

export function venueClaimApprovedEmail({ requesterName, venueName, loginUrl }) {
  return {
    subject: "Your venue claim was approved",
    html: wrapTemplate(
      "Venue claim approved",
      `Hi ${requesterName || "there"}, your claim for ${venueName || "the venue"} has been approved.`,
      "Open Eventwow",
      loginUrl,
      ["Sign in with this email to access your venue dashboard."]
    ),
  };
}

export function venueClaimRejectedEmail({ requesterName, venueName, contactUrl }) {
  return {
    subject: "Update on your venue claim request",
    html: wrapTemplate(
      "Venue claim not approved",
      `Hi ${requesterName || "there"}, we could not approve your claim for ${venueName || "the venue"} at this time.`,
      "Contact support",
      contactUrl,
      ["If this is a mistake, please reply with additional ownership details."]
    ),
  };
}

export function supplierSignupMagicLinkEmail({ businessName, actionUrl }) {
  return {
    subject: "Your Eventwow supplier login link",
    html: wrapTemplate(
      "Welcome to Eventwow",
      `Your supplier account${businessName ? ` for ${businessName}` : ""} is ready. Use the secure link below to continue onboarding.`,
      "Continue to onboarding",
      actionUrl,
      [
        "You start with 25 free credits.",
        "Complete your listing profile before going live.",
      ]
    ),
  };
}
