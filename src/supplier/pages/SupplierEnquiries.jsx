import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { Button, Feedback } from "../../components/workspace/AdminPrimitives";
import {
  DataTable,
  FilterBar,
  StatusBadge,
  WorkspaceDialog,
} from "../../components/workspace/WorkspaceComponents";
import { supabase } from "../../lib/supabase";

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Session expired. Please sign in again.");

  const resp = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (resp.status === 401) {
    await supabase.auth.signOut();
    throw new Error("Session expired. Please sign in again.");
  }
  return resp;
}

export default function SupplierEnquiries({ supplierId, onCreateQuote }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const selectedRow = rows.find((row) => row.id === selectedId);

  async function load() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      const resp = await authFetch(
        `/api/supplier-enquiries${qs.toString() ? `?${qs.toString()}` : ""}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to load enquiries",
        );
      setRows(json?.rows || []);
    } catch (e) {
      const msg = e?.message || "Failed to load enquiries";
      setErr(msg);
      if (msg.toLowerCase().includes("session expired")) {
        window.location.assign("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, status]);

  const filtered = useMemo(() => {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row?.status,
        row?.customerName,
        row?.enquiry?.customerName,
        row?.enquiry?.locationLabel,
        row?.enquiry?.venue?.name,
        row?.enquiry?.venue?.address,
        row?.enquiry?.postcode,
        row?.enquiry?.message,
        row?.shortMessagePreview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  async function declineEnquiry(enquiryId) {
    setBusyId(enquiryId);
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-decline-enquiry", {
        method: "POST",
        body: JSON.stringify({ enquiryId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to decline enquiry",
        );
      setOk("Enquiry declined.");
      await load();
    } catch (e) {
      setErr(e?.message || "Failed to decline enquiry");
    } finally {
      setBusyId("");
    }
  }

  async function createQuote(enquiryId) {
    setBusyId(enquiryId);
    setErr("");
    setOk("");
    try {
      const resp = await authFetch("/api/supplier-start-quote-from-enquiry", {
        method: "POST",
        body: JSON.stringify({ enquiryId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to create quote",
        );
      const quoteId = json?.quoteId;
      if (!quoteId) throw new Error("No quote returned");
      setOk(
        json?.existed ? "Opening existing quote..." : "Draft quote created.",
      );
      if (typeof onCreateQuote === "function") onCreateQuote(quoteId);
    } catch (e) {
      setErr(e?.message || "Failed to create quote");
    } finally {
      setBusyId("");
    }
  }

  function actions(row) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => createQuote(row.enquiryId)}
          disabled={busyId === row.enquiryId || row.status === "declined"}
        >
          {row.quoteId ? "View quote" : "Create quote"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          onClick={() => declineEnquiry(row.enquiryId)}
          disabled={
            busyId === row.enquiryId ||
            row.status === "declined" ||
            row.status === "quoted"
          }
        >
          Decline
        </Button>
      </div>
    );
  }
  return (
    <div className="ew-page-stack">
      <PageHeader
        title="Enquiries"
        subtitle="Review invitations and event details before sending quotes."
        actions={[
          {
            key: "refresh",
            label: "Refresh",
            variant: "secondary",
            onClick: load,
            disabled: loading,
          },
        ]}
      />
      {ok && <Feedback tone="success">{ok}</Feedback>}
      <div className="ew-panel">
        <FilterBar
          search={query}
          onSearchChange={setQuery}
          placeholder="Search customer, venue, status or notes"
          status={status || "all"}
          onStatusChange={(value) => setStatus(value === "all" ? "" : value)}
          statuses={[
            { value: "invited", label: "Invited" },
            { value: "quoted", label: "Quoted" },
            { value: "declined", label: "Declined" },
          ]}
          count={loading || err ? null : filtered.length}
        />
        <DataTable
          className="ew-admin-table"
          caption="Supplier enquiries"
          rows={filtered}
          loading={loading}
          error={err}
          onRetry={load}
          emptyTitle="No enquiries found"
          emptyDescription="New customer requests will appear here. Try another filter if needed."
          columns={[
            {
              key: "customer",
              label: "Customer",
              render: (row) => (
                <div>
                  <button
                    className="ew-text-action"
                    onClick={() => setSelectedId(row.id)}
                  >
                    {row.customerName ||
                      row.enquiry?.customerName ||
                      "Customer"}
                  </button>
                  <small>Invited: {fmtDate(row.invitedAt)}</small>
                </div>
              ),
            },
            {
              key: "event",
              label: "Event",
              render: (row) => (
                <div>
                  {row.enquiry?.eventDate || "—"}
                  <small>
                    {row.enquiry?.categoryLabel || "—"}
                    {row.enquiry?.guestCount != null
                      ? ` · ${row.enquiry.guestCount} guests`
                      : ""}
                  </small>
                </div>
              ),
            },
            {
              key: "location",
              label: "Location",
              render: (row) =>
                row.enquiry?.venue?.name ||
                row.enquiry?.locationLabel ||
                row.enquiry?.postcode ||
                "—",
            },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusBadge status={row.status} />,
            },
            { key: "actions", label: "Actions", render: actions },
          ]}
        />
      </div>
      <WorkspaceDialog
        open={!!selectedRow}
        onClose={() => setSelectedId(null)}
        title="Request details"
        footer={selectedRow ? actions(selectedRow) : null}
      >
        {selectedRow && (
          <div className="ew-record-details space-y-4">
            {err && <Feedback>{err}</Feedback>}
            <StatusBadge status={selectedRow.status} />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="ew-field-label">Customer</dt>
                <dd>
                  {selectedRow.customerName ||
                    selectedRow.enquiry?.customerName ||
                    "Customer"}
                </dd>
              </div>
              <div>
                <dt className="ew-field-label">Date</dt>
                <dd>{selectedRow.enquiry?.eventDate || "—"}</dd>
              </div>
              <div>
                <dt className="ew-field-label">Time</dt>
                <dd>{selectedRow.enquiry?.startTime || "—"}</dd>
              </div>
              <div>
                <dt className="ew-field-label">Guests</dt>
                <dd>{selectedRow.enquiry?.guestCount ?? "—"}</dd>
              </div>
              <div>
                <dt className="ew-field-label">Budget</dt>
                <dd>
                  {selectedRow.enquiry?.budget?.label ||
                    selectedRow.enquiry?.budget?.range ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt className="ew-field-label">Category</dt>
                <dd>{selectedRow.enquiry?.categoryLabel || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="ew-field-label">Venue</dt>
                <dd>
                  {[
                    selectedRow.enquiry?.venue?.name,
                    selectedRow.enquiry?.venue?.address,
                    selectedRow.enquiry?.venue?.locationLabel ||
                      selectedRow.enquiry?.locationLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
            </dl>
            {selectedRow.enquiry?.message && (
              <section>
                <h3 className="ew-field-label">Message</h3>
                <p className="whitespace-pre-wrap">
                  {selectedRow.enquiry.message}
                </p>
              </section>
            )}
            <p className="ew-form-help">
              Invited: {fmtDate(selectedRow.invitedAt)}
            </p>
          </div>
        )}
      </WorkspaceDialog>
    </div>
  );
}
