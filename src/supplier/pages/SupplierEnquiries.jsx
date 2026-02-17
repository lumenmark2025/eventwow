import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import { supabase } from "../../lib/supabase";
import EnquirySummaryCard from "../components/EnquirySummaryCard";

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "quoted") return "brand";
  if (s === "declined") return "danger";
  if (s === "invited") return "warning";
  return "neutral";
}

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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

  async function load() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      const resp = await authFetch(`/api/supplier-enquiries${qs.toString() ? `?${qs.toString()}` : ""}`);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load enquiries");
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
    const q = String(query || "").trim().toLowerCase();
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
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to decline enquiry");
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
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to create quote");
      const quoteId = json?.quoteId;
      if (!quoteId) throw new Error("No quote returned");
      setOk(json?.existed ? "Opening existing quote..." : "Draft quote created.");
      if (typeof onCreateQuote === "function") onCreateQuote(quoteId);
    } catch (e) {
      setErr(e?.message || "Failed to create quote");
    } finally {
      setBusyId("");
    }
  }

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enquiries"
        subtitle="Review invitations with full event details before sending quotes."
        actions={[{ key: "refresh", label: "Refresh", variant: "secondary", onClick: load }]}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, venue, status or notes"
        />
        <select
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="invited">Invited</option>
          <option value="quoted">Quoted</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      {err ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div> : null}

      {filtered.length === 0 ? (
        <EmptyState title="No enquiries yet" description="New customer requests will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">
                    {row.customerName || row.enquiry?.customerName || "Customer"}
                  </CardTitle>
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {row.enquiry?.categoryLabel ? <Badge variant="neutral">{row.enquiry.categoryLabel}</Badge> : null}
                  {row.enquiry?.eventDate ? <Badge variant="neutral">{row.enquiry.eventDate}</Badge> : null}
                  {row.enquiry?.guestCount ? <Badge variant="neutral">{row.enquiry.guestCount} guests</Badge> : null}
                  {row.enquiry?.budget?.label ? <Badge variant="neutral">Budget: {row.enquiry.budget.label}</Badge> : null}
                </div>
                <EnquirySummaryCard enquiry={row.enquiry} compact />
                <p className="text-xs text-slate-500">Invited: {fmtDate(row.invitedAt)}</p>
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
                    variant="secondary"
                    onClick={() => declineEnquiry(row.enquiryId)}
                    disabled={busyId === row.enquiryId || row.status === "declined" || row.status === "quoted"}
                  >
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
