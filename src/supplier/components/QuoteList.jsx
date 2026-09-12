import { useMemo, useState } from "react";
import {
  DataTable,
  FilterBar,
  StatusBadge,
} from "../../components/workspace/WorkspaceComponents";

// List-only state; quote editing and mutations remain with the existing workflow.
export default function QuoteList({
  rows,
  supplierCredits,
  selectedQuoteId,
  openQuote,
  statusText,
  money,
  fmtDateTime,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesStatus =
          statusFilter === "all" || statusText(row) === statusFilter;
        const text = [
          row.customer?.name,
          row.enquiries?.customer_name,
          row.event_location_label,
          row.enquiries?.location_label,
          row.enquiry?.eventDate,
          row.enquiries?.event_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return matchesStatus && text.includes(search.trim().toLowerCase());
      }),
    [rows, search, statusFilter, statusText],
  );
  return (
    <section className="ew-panel">
      <div className="ew-panel-heading">
        <h2>Quote list</h2>
        <p className="ew-form-help">
          Credits: {supplierCredits === null ? "—" : supplierCredits} · 1 credit
          per quote sent
        </p>
      </div>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search customer, location or date"
        status={statusFilter}
        onStatusChange={setStatusFilter}
        statuses={[
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Sent" },
          { value: "accepted", label: "Accepted" },
          { value: "declined", label: "Declined" },
          { value: "closed", label: "Closed" },
          {
            value: "updated_awaiting_acceptance",
            label: "Updated – awaiting acceptance",
          },
        ]}
        count={filteredRows.length}
      />
      <DataTable
        className="ew-admin-table"
        caption="Supplier quotes"
        rows={filteredRows}
        emptyTitle="No quotes found"
        emptyDescription="Create a quote from an enquiry, or adjust your filters."
        columns={[
          {
            key: "customer",
            label: "Customer",
            render: (q) => (
              <div>
                <button
                  className="ew-text-action"
                  aria-current={selectedQuoteId === q.id ? "true" : undefined}
                  onClick={() => openQuote(q.id)}
                >
                  {q.customer?.name ||
                    q.enquiries?.customer_name ||
                    "Unknown customer"}
                </button>
                <small>
                  {q.event_location_label ||
                    q.enquiries?.location_label ||
                    "Location not provided"}
                </small>
              </div>
            ),
          },
          {
            key: "event",
            label: "Event",
            render: (q) => (
              <div>
                {q.enquiry?.eventDate || q.enquiries?.event_date || "—"}
                <small>
                  Guests:{" "}
                  {q.enquiry?.guestCount ?? q.enquiries?.guest_count ?? "—"}
                  {q.enquiry?.startTime || q.enquiries?.start_time
                    ? ` · Time: ${q.enquiry?.startTime || q.enquiries?.start_time}`
                    : ""}
                </small>
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (q) => (
              <StatusBadge status={statusText(q)}>
                {statusText(q).replaceAll("_", " ")}
              </StatusBadge>
            ),
          },
          {
            key: "total",
            label: "Total",
            render: (q) => `£${money(q.total_amount)}`,
          },
          {
            key: "activity",
            label: "Activity",
            render: (q) => (
              <div>
                <small>Created: {fmtDateTime(q.created_at)}</small>
                {q.sent_at && <small>Sent: {fmtDateTime(q.sent_at)}</small>}
                {q.accepted_at && (
                  <small>Accepted: {fmtDateTime(q.accepted_at)}</small>
                )}
                {q.declined_at && (
                  <small>Declined: {fmtDateTime(q.declined_at)}</small>
                )}
                {q.closed_at && (
                  <small>Closed: {fmtDateTime(q.closed_at)}</small>
                )}
              </div>
            ),
          },
        ]}
      />
      <div className="ew-form-section-body ew-form-help">
        Quotes can be edited at any stage. Sending a quote uses 1 credit.
      </div>
    </section>
  );
}
