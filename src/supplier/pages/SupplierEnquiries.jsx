import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";

function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function fmtDateTime(d) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function statusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "accepted") return "success";
  if (s === "declined") return "danger";
  if (s === "quoted") return "brand";
  if (s === "responded") return "warning";
  return "neutral";
}

export default function SupplierEnquiries({ supplierId, onCreateQuote }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");

  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState("");

  async function load() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("enquiry_suppliers")
      .select(
        "id,supplier_status,created_at,viewed_at,responded_at,enquiry_id,enquiries(id,status,event_date,event_postcode,guest_count,budget_min_gbp,budget_max_gbp,notes,venues(name),customers(full_name,email,phone))"
      )
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const venue = String(r.enquiries?.venues?.name || "").toLowerCase();
      const post = String(r.enquiries?.event_postcode || "").toLowerCase();
      const status = String(r.supplier_status || "").toLowerCase();
      return venue.includes(q) || post.includes(q) || status.includes(q);
    });
  }, [rows, query]);

  const selectedRow = useMemo(
    () => (selected ? rows.find((r) => r.id === selected) : null),
    [selected, rows]
  );
  const e = selectedRow?.enquiries;

  function patchRow(rowId, patch) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }

  async function markViewedIfNeeded(row) {
    if (!row?.id) return;
    if (row.viewed_at) return;

    const nextStatus = row.supplier_status === "invited" ? "viewed" : row.supplier_status;
    const nowIso = new Date().toISOString();

    patchRow(row.id, { viewed_at: nowIso, supplier_status: nextStatus });

    const { error } = await supabase
      .from("enquiry_suppliers")
      .update({
        viewed_at: nowIso,
        supplier_status: nextStatus,
      })
      .eq("id", row.id);

    if (error) {
      setErr(error.message);
      await load();
    }
  }

  async function markResponded(row) {
    if (!row?.id) return;

    const current = String(row.supplier_status || "").toLowerCase();
    const blocked = ["quoted", "accepted", "declined"].includes(current);
    if (blocked) return;

    const nowIso = new Date().toISOString();

    setActionBusy(true);
    setErr("");
    setActionMsg("");
    setQuoteMsg("");

    patchRow(row.id, { responded_at: nowIso, supplier_status: "responded" });

    const { error } = await supabase
      .from("enquiry_suppliers")
      .update({
        responded_at: nowIso,
        supplier_status: "responded",
      })
      .eq("id", row.id);

    if (error) {
      setErr(error.message);
      await load();
    } else {
      setActionMsg("Marked as responded.");
    }

    setActionBusy(false);
  }

  async function handleSelect(rowId) {
    setSelected(rowId);
    setActionMsg("");
    setQuoteMsg("");
    setErr("");

    const row = rows.find((r) => r.id === rowId);
    if (row) {
      await markViewedIfNeeded(row);
    }
  }

  async function createOrOpenDraftQuote() {
    if (!supplierId || !selectedRow?.enquiry_id) return;

    setQuoteBusy(true);
    setErr("");
    setQuoteMsg("");
    setActionMsg("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-create-draft-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ enquiry_id: selectedRow.enquiry_id }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to create quote");

      const quoteId = json.quote_id;
      if (!quoteId) throw new Error("No quote_id returned from server");

      setQuoteMsg(json.existed ? "Opening existing quote..." : "Draft quote created.");
      if (typeof onCreateQuote === "function") onCreateQuote(quoteId);
    } catch (ex) {
      setErr(ex?.message || "Failed to create quote.");
    } finally {
      setQuoteBusy(false);
    }
  }

  const canRespond =
    !!selectedRow &&
    !selectedRow.responded_at &&
    !["quoted", "accepted", "declined"].includes(String(selectedRow.supplier_status || "").toLowerCase());

  const canCreateQuote =
    !!selectedRow &&
    !["accepted", "declined"].includes(String(selectedRow.supplier_status || "").toLowerCase());

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }

  if (err) return <div className="text-sm text-red-600">{err}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Requests" subtitle="Review enquiries, respond quickly, and move to quote drafting." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <CardTitle>Available requests</CardTitle>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search venue, postcode, status"
                className="w-full sm:w-64"
                aria-label="Search requests"
              />
              <Button type="button" variant="secondary" onClick={load} className="w-full sm:w-auto">Refresh</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[560px] overflow-auto">
            {filteredRows.length === 0 ? (
              <EmptyState title="No matching requests" description="Try another search or clear filters." />
            ) : (
              filteredRows.map((r) => {
                const isActive = selected === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r.id)}
                    className={
                      "w-full rounded-xl border p-4 text-left transition-shadow hover:shadow-sm " +
                      (isActive ? "border-brand" : "border-slate-200")
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-slate-900">{r.enquiries?.venues?.name || "No venue"}</div>
                      <Badge variant={statusVariant(r.supplier_status)}>{r.supplier_status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="neutral">{fmtDate(r.enquiries?.event_date)}</Badge>
                      {r.enquiries?.guest_count ? <Badge variant="neutral">{r.enquiries.guest_count} guests</Badge> : null}
                      {r.enquiries?.event_postcode ? <Badge variant="neutral">{r.enquiries.event_postcode}</Badge> : null}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Viewed: {r.viewed_at ? "Yes" : "No"} - Responded: {r.responded_at ? "Yes" : "No"}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request detail</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedRow ? (
              <EmptyState title="Select a request" description="Choose any request from the left to see full detail and actions." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-slate-500">Venue</div>
                    <div className="text-lg font-semibold">{e?.venues?.name || "No venue"}</div>
                  </div>
                  <Badge variant={statusVariant(selectedRow.supplier_status)}>{selectedRow.supplier_status}</Badge>
                </div>

                {actionMsg ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{actionMsg}</div> : null}
                {quoteMsg ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{quoteMsg}</div> : null}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-medium">Actions</div>
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <Button type="button" variant="secondary" disabled={!canRespond || actionBusy} onClick={() => markResponded(selectedRow)}>
                      {selectedRow.responded_at ? "Responded" : actionBusy ? "Working..." : "Mark as responded"}
                    </Button>
                    <Button type="button" variant="primary" disabled={!canCreateQuote || quoteBusy} onClick={createOrOpenDraftQuote}>
                      {quoteBusy ? "Working..." : "Create / open draft quote"}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Viewed: {fmtDateTime(selectedRow.viewed_at)} - Responded: {fmtDateTime(selectedRow.responded_at)}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Event date</div><div className="font-medium">{fmtDate(e?.event_date)}</div></div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Postcode</div><div className="font-medium">{e?.event_postcode || "-"}</div></div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Guests</div><div className="font-medium">{e?.guest_count ?? "-"}</div></div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Enquiry status</div><div className="font-medium">{e?.status || "-"}</div></div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-slate-500">Budget</div>
                  <div className="font-medium">GBP {Number(e?.budget_min_gbp || 0).toFixed(0)} - GBP {Number(e?.budget_max_gbp || 0).toFixed(0)}</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-slate-500">Customer</div>
                  <div className="font-medium">{e?.customers?.full_name || "-"}</div>
                  <div className="text-slate-600">{e?.customers?.email || ""}</div>
                  <div className="text-slate-600">{e?.customers?.phone || ""}</div>
                </div>

                {e?.notes ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-slate-500">Notes</div>
                    <div>{e.notes}</div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
