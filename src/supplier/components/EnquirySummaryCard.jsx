function formatBudget(budget) {
  if (!budget) return "-";
  if (budget.label) return budget.label;
  if (budget.range) return budget.range;
  return "-";
}

function renderVenue(venue, locationLabel) {
  const parts = [venue?.name, venue?.address, venue?.locationLabel || locationLabel].filter(Boolean);
  if (parts.length === 0) return "-";
  return parts.join(" • ");
}

export default function EnquirySummaryCard({ enquiry, compact = false, className = "" }) {
  if (!enquiry) return null;

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 ${className}`.trim()}>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <p><span className="text-slate-500">Customer:</span> <span className="font-medium text-slate-900">{enquiry.customerName || "Customer"}</span></p>
        <p><span className="text-slate-500">Date:</span> {enquiry.eventDate || "-"}</p>
        <p><span className="text-slate-500">Time:</span> {enquiry.startTime || "-"}</p>
        <p><span className="text-slate-500">Guests:</span> {enquiry.guestCount ?? "-"}</p>
        <p><span className="text-slate-500">Budget:</span> {formatBudget(enquiry.budget)}</p>
        <p><span className="text-slate-500">Category:</span> {enquiry.categoryLabel || "-"}</p>
      </div>
      <p className="mt-2 text-sm">
        <span className="text-slate-500">Venue:</span>{" "}
        <span className="text-slate-800">{renderVenue(enquiry.venue, enquiry.locationLabel)}</span>
      </p>
      {enquiry.message ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
          {compact ? enquiry.shortMessagePreview || enquiry.message : enquiry.message}
        </div>
      ) : null}
    </div>
  );
}
