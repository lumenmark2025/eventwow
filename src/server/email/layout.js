function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function line(text) {
  return `<p style="margin:0 0 12px 0;color:#334155;font-size:14px;line-height:1.6;">${escapeHtml(text)}</p>`;
}

export function renderEmailLayout({ title, intro, lines = [], ctaLabel, ctaUrl }) {
  const bodyLines = [intro, ...lines].filter(Boolean).map((text) => line(text)).join("");
  const cta = ctaUrl
    ? `<p style="margin:20px 0 0 0;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">
          ${escapeHtml(ctaLabel || "Open")}
        </a>
      </p>`
    : "";

  return `
  <div style="background:#f1f5f9;margin:0;padding:24px 10px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbeafe;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(110deg,#1d4ed8,#60a5fa);padding:20px 24px;">
        <div style="font-size:30px;line-height:1;font-weight:800;color:#ffffff;letter-spacing:-0.03em;">eventwow</div>
      </div>
      <div style="padding:22px 24px;">
        <h1 style="margin:0 0 12px 0;color:#0f172a;font-size:22px;line-height:1.3;">${escapeHtml(title || "Eventwow update")}</h1>
        ${bodyLines}
        ${cta}
      </div>
      <div style="border-top:1px solid #e2e8f0;padding:14px 24px;background:#f8fafc;">
        <p style="margin:0 0 6px 0;color:#64748b;font-size:12px;">Eventwow.co.uk</p>
        <p style="margin:0 0 6px 0;color:#64748b;font-size:12px;">Support: support@eventwow.co.uk</p>
        <p style="margin:0;color:#64748b;font-size:12px;">Manage notifications (coming soon)</p>
      </div>
    </div>
  </div>`;
}

export function renderEmailText({ title, intro, lines = [], ctaLabel, ctaUrl }) {
  const content = [title, "", intro, ...lines.filter(Boolean), ctaUrl ? "" : null, ctaUrl ? `${ctaLabel || "Open"}: ${ctaUrl}` : null]
    .filter((v) => v !== null)
    .join("\n");
  return `${content}\n\nEventwow.co.uk\nSupport: support@eventwow.co.uk`;
}

