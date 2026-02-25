function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function footerNoteRow(footerNote) {
  if (!footerNote) return "";
  return `
            <tr>
              <td style="padding:0 24px 12px 24px;">
                <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                  ${escapeHtml(footerNote)}
                </p>
              </td>
            </tr>`;
}

export { escapeHtml };

export function renderEmail({ metaTitle, headline, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const safeMetaTitle = escapeHtml(metaTitle || "Eventwow update");
  const safeHeadline = escapeHtml(headline || "Eventwow update");
  const safeCtaUrl = escapeHtml(ctaUrl || "https://eventwow.co.uk");
  const safeCtaLabel = escapeHtml(ctaLabel || "Open Eventwow");
  const safeBodyHtml = String(bodyHtml || "");
  const year = new Date().getFullYear();

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeMetaTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">

            <!-- Header -->
            <tr>
              <td style="padding:22px 24px;border-bottom:1px solid #eef0f5;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left">
                      <img
                        src="https://www.rewarddigital.co.uk/assets/eventwow_logo.gif"
                        alt="Eventwow"
                        height="36"
                        style="display:block;border:0;outline:none;text-decoration:none;height:36px;"
                      />
                    </td>
                    <td align="right" style="font-size:12px;color:#6b7280;">
                      ${safeMetaTitle}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:26px 24px 10px 24px;">
                <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.25;color:#111827;">
                  ${safeHeadline}
                </h1>

                <div style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">
                  ${safeBodyHtml}
                </div>

                <!-- CTA -->
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 10px 0;">
                  <tr>
                    <td bgcolor="#2563eb" style="border-radius:12px;">
                      <a
                        href="${safeCtaUrl}"
                        style="display:inline-block;padding:12px 18px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;"
                      >
                        ${safeCtaLabel}
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                  If the button doesn't work, copy and paste this link into your browser:
                </p>
                <p style="margin:6px 0 0 0;font-size:12px;line-height:1.6;word-break:break-all;">
                  <a href="${safeCtaUrl}" style="color:#2563eb;text-decoration:underline;">
                    ${safeCtaUrl}
                  </a>
                </p>
              </td>
            </tr>

            <!-- Optional footer note -->
            ${footerNoteRow(footerNote)}

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;background:#fafbff;border-top:1px solid #eef0f5;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:12px;color:#6b7280;">
                      &copy; ${year} Eventwow •
                      <a href="https://eventwow.co.uk" style="color:#2563eb;text-decoration:none;">
                        eventwow.co.uk
                      </a>
                    </td>
                    <td align="right" style="font-size:12px;color:#6b7280;">
                      Need help?
                      <a href="https://eventwow.co.uk/contact" style="color:#2563eb;text-decoration:none;">
                        Contact us
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${safeHeadline}

${stripHtml(safeBodyHtml)}

${safeCtaLabel}:
${ctaUrl || "https://eventwow.co.uk"}

-
Eventwow
https://eventwow.co.uk
Support: support@eventwow.co.uk`;

  return { html, text };
}
