import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Modal,
  Feedback,
  FormField,
  Input,
  Select,
  Textarea,
} from "../../components/workspace/AdminPrimitives";
import { DataTable } from "../../components/workspace/WorkspaceComponents";
import { CalendarDays, List } from "lucide-react";
const BookingsCalendar = lazy(
  () => import("../../components/supplier/BookingsCalendar"),
);

function toDateInputValue(d) {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function money(value) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
  } catch {
    return `GBP ${amount.toFixed(2)}`;
  }
}

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-GB");
  } catch {
    return value;
  }
}

function fmtDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
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

function paymentBadge(paid) {
  return paid ? "success" : "warning";
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "confirmed" || s === "completed") return "success";
  if (s === "cancelled") return "danger";
  return "neutral";
}

function emptyBookingForm() {
  return {
    event_date: toDateInputValue(new Date()),
    start_time: "",
    end_time: "",
    location_text: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    guest_count: "",
    status: "confirmed",
    source_id: "",
    value_gross: "",
    deposit_amount: "",
    balance_amount: "",
    is_deposit_paid: false,
    is_balance_paid: false,
    supplier_notes: "",
  };
}

function bookingToForm(row) {
  return {
    event_date: row?.event_date || "",
    start_time: row?.start_time || "",
    end_time: row?.end_time || "",
    location_text: row?.location_text || "",
    customer_name: row?.customer_name || "",
    customer_email: row?.customer_email || "",
    customer_phone: row?.customer_phone || "",
    guest_count: row?.guest_count ?? "",
    status: row?.status || "confirmed",
    source_id: row?.source_id || "",
    value_gross: row?.value_gross ?? "",
    deposit_amount: row?.deposit_amount ?? "",
    balance_amount: row?.balance_amount ?? "",
    is_deposit_paid: !!row?.is_deposit_paid,
    is_balance_paid: !!row?.is_balance_paid,
    supplier_notes: row?.supplier_notes || "",
  };
}

export default function SupplierBookings() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const defaultTo = new Date(today);
  defaultTo.setDate(defaultTo.getDate() + 90);

  const [origin, setOrigin] = useState("all");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState(toDateInputValue(defaultFrom));
  const [to, setTo] = useState(toDateInputValue(defaultTo));
  const [calendarCurrentDate, setCalendarCurrentDate] = useState(today);
  const [calendarCurrentView, setCalendarCurrentView] = useState("month");
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "list";
    const saved = String(
      window.localStorage.getItem("supplier_bookings_view_mode") || "",
    ).toLowerCase();
    return saved === "calendar" ? "calendar" : "list";
  });

  const [selectedId, setSelectedId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detail, setDetail] = useState(null);

  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareMsg, setShareMsg] = useState("");

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesErr, setSourcesErr] = useState("");
  const [sources, setSources] = useState([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [sourceBusyId, setSourceBusyId] = useState("");

  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingModalMode, setBookingModalMode] = useState("create");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingErr, setBookingErr] = useState("");
  const [bookingForm, setBookingForm] = useState(emptyBookingForm());
  const lastCalendarRangeRef = useRef("");

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  );

  const activeSources = useMemo(
    () => sources.filter((s) => s.is_active),
    [sources],
  );

  function setFormField(key, value) {
    setBookingForm((prev) => ({ ...prev, [key]: value }));
  }

  function setBookingViewMode(nextMode) {
    const value = nextMode === "calendar" ? "calendar" : "list";
    setViewMode(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("supplier_bookings_view_mode", value);
    }
  }

  function handleCalendarRangeChange(range) {
    const nextFrom = String(range?.from || "").trim();
    const nextTo = String(range?.to || "").trim();
    if (!nextFrom || !nextTo) return;
    const rangeKey = `${nextFrom}__${nextTo}`;
    if (lastCalendarRangeRef.current === rangeKey) return;
    lastCalendarRangeRef.current = rangeKey;
    if (nextFrom !== from) setFrom(nextFrom);
    if (nextTo !== to) setTo(nextTo);
  }

  function handleCalendarNavigate(nextDate) {
    if (!(nextDate instanceof Date) || Number.isNaN(nextDate.getTime())) return;
    if (import.meta.env.DEV) {
      console.debug("[bookings-calendar] navigate", {
        from: calendarCurrentDate,
        to: nextDate,
        view: calendarCurrentView,
      });
    }
    setCalendarCurrentDate(nextDate);
  }

  function handleCalendarView(nextView) {
    if (!nextView) return;
    if (import.meta.env.DEV) {
      console.debug("[bookings-calendar] view", {
        view: nextView,
        date: calendarCurrentDate,
      });
    }
    setCalendarCurrentView(nextView);
  }

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (origin && origin !== "all") params.set("origin", origin);
      if (status) params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const resp = await authFetch(
        `/api/supplier/bookings?${params.toString()}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to load bookings",
        );
      const next = Array.isArray(json?.rows) ? json.rows : [];
      setRows(next);

      if (selectedId && !next.some((row) => row.id === selectedId)) {
        setSelectedId("");
        setDetail(null);
      }
    } catch (e) {
      setErr(e?.message || "Failed to load bookings");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    if (!id) return;
    setDetailLoading(true);
    setDetailErr("");
    setShareMsg("");
    setShareUrl("");
    try {
      const resp = await authFetch(
        `/api/supplier/bookings/${encodeURIComponent(id)}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to load booking",
        );
      setDetail(json?.row || null);
      if (json?.row?.customer_share_url) {
        setShareUrl(String(json.row.customer_share_url));
        setShareMsg("Customer link ready.");
      }
    } catch (e) {
      setDetailErr(e?.message || "Failed to load booking");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadSources() {
    setSourcesLoading(true);
    setSourcesErr("");
    try {
      const resp = await authFetch("/api/supplier/booking-sources");
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to load sources",
        );
      setSources(Array.isArray(json?.rows) ? json.rows : []);
    } catch (e) {
      setSourcesErr(e?.message || "Failed to load sources");
      setSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }

  async function ensureSourceDefaults() {
    setSourceBusyId("ensure-defaults");
    setSourcesErr("");
    try {
      const resp = await authFetch("/api/supplier/booking-sources", {
        method: "PUT",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to ensure defaults",
        );
      setSources(Array.isArray(json?.rows) ? json.rows : []);
    } catch (e) {
      setSourcesErr(e?.message || "Failed to ensure defaults");
    } finally {
      setSourceBusyId("");
    }
  }
  async function addSource() {
    const name = newSourceName.trim();
    if (!name) return;
    setSourceBusyId("new");
    setSourcesErr("");
    try {
      const resp = await authFetch("/api/supplier/booking-sources", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(json?.details || json?.error || "Failed to add source");
      setNewSourceName("");
      await loadSources();
    } catch (e) {
      setSourcesErr(e?.message || "Failed to add source");
    } finally {
      setSourceBusyId("");
    }
  }

  async function patchSource(sourceId, patch) {
    setSourceBusyId(sourceId);
    setSourcesErr("");
    try {
      const resp = await authFetch(
        `/api/supplier/booking-sources/${encodeURIComponent(sourceId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to update source",
        );
      setSources((prev) =>
        prev.map((row) => (row.id === sourceId ? json.row : row)),
      );
    } catch (e) {
      setSourcesErr(e?.message || "Failed to update source");
    } finally {
      setSourceBusyId("");
    }
  }

  function openCreateBooking() {
    setBookingModalMode("create");
    setBookingErr("");
    setBookingForm(emptyBookingForm());
    setBookingModalOpen(true);
  }

  function openEditBooking() {
    if (!detail) return;
    setBookingModalMode("edit");
    setBookingErr("");
    setBookingForm(bookingToForm(detail));
    setBookingModalOpen(true);
  }

  async function saveBooking() {
    setBookingBusy(true);
    setBookingErr("");
    try {
      const payload = {
        event_date: bookingForm.event_date || null,
        start_time: bookingForm.start_time || null,
        end_time: bookingForm.end_time || null,
        location_text: bookingForm.location_text || null,
        customer_name: bookingForm.customer_name || null,
        customer_email: bookingForm.customer_email || null,
        customer_phone: bookingForm.customer_phone || null,
        guest_count:
          bookingForm.guest_count === ""
            ? null
            : Number(bookingForm.guest_count),
        status: bookingForm.status || "confirmed",
        source_id: bookingForm.source_id || null,
        value_gross:
          bookingForm.value_gross === ""
            ? null
            : Number(bookingForm.value_gross),
        deposit_amount:
          bookingForm.deposit_amount === ""
            ? null
            : Number(bookingForm.deposit_amount),
        balance_amount:
          bookingForm.balance_amount === ""
            ? null
            : Number(bookingForm.balance_amount),
        is_deposit_paid: !!bookingForm.is_deposit_paid,
        is_balance_paid: !!bookingForm.is_balance_paid,
        supplier_notes: bookingForm.supplier_notes || null,
      };

      if (!payload.event_date) throw new Error("Event date is required");

      const isCreate = bookingModalMode === "create";
      const path = isCreate
        ? "/api/supplier/bookings"
        : `/api/supplier/bookings/${encodeURIComponent(detail?.id || "")}`;
      const method = isCreate ? "POST" : "PATCH";

      const resp = await authFetch(path, {
        method,
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to save booking",
        );

      setBookingModalOpen(false);
      await load();
      if (json?.row?.id) {
        setSelectedId(json.row.id);
        await loadDetail(json.row.id);
      }
      if (isCreate && json?.customer_share_url) {
        setShareUrl(String(json.customer_share_url));
        setShareMsg("Customer link created and copied.");
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(String(json.customer_share_url));
        }
      }
    } catch (e) {
      setBookingErr(e?.message || "Failed to save booking");
    } finally {
      setBookingBusy(false);
    }
  }

  async function createShareLink() {
    if (!selectedId || shareBusy) return;
    setShareBusy(true);
    setShareMsg("");
    try {
      const resp = await authFetch(
        `/api/supplier/bookings/${encodeURIComponent(selectedId)}/create-access-link`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to create share link",
        );
      const nextUrl = String(json?.url || json?.share_url || "").trim();
      setShareUrl(nextUrl);
      setShareMsg("Customer link ready.");
      if (nextUrl && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(nextUrl);
      }
    } catch (e) {
      setShareMsg(e?.message || "Failed to create share link");
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShareLink() {
    if (!selectedId || shareBusy) return;
    setShareBusy(true);
    setShareMsg("");
    try {
      const resp = await authFetch(
        `/api/supplier/bookings/${encodeURIComponent(selectedId)}/revoke-access-link`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to revoke share link",
        );
      setShareUrl("");
      setShareMsg("Customer link revoked.");
    } catch (e) {
      setShareMsg(e?.message || "Failed to revoke share link");
    } finally {
      setShareBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, status, from, to]);

  useEffect(() => {
    if (!selectedId) return;
    document.getElementById("supplier-booking-detail")?.focus();
    loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!bookingModalOpen || !sources.length || bookingForm.source_id) return;
    const firstActive = sources.find((row) => row.is_active);
    if (firstActive) setFormField("source_id", firstActive.id);
  }, [bookingModalOpen, sources, bookingForm.source_id]);

  return (
    <div className="ew-page-stack">
      <PageHeader
        title="Bookings"
        subtitle="Track Eventwow and external bookings in one place."
        actions={[
          {
            key: "add",
            label: "Add external booking",
            onClick: openCreateBooking,
          },
          {
            key: "sources",
            label: "Manage sources",
            variant: "secondary",
            onClick: () => {
              setSourcesOpen(true);
              loadSources();
            },
          },
          {
            key: "refresh",
            label: "Refresh",
            variant: "secondary",
            onClick: load,
          },
        ]}
      />

      <Card>
        <CardContent className="py-4">
          <div
            className="flex flex-wrap gap-2 mb-4"
            role="group"
            aria-label="Booking view"
          >
            <Button
              variant={viewMode === "list" ? "primary" : "secondary"}
              aria-pressed={viewMode === "list"}
              onClick={() => setBookingViewMode("list")}
            >
              <List size={16} aria-hidden="true" />
              List
            </Button>
            <Button
              variant={viewMode === "calendar" ? "primary" : "secondary"}
              aria-pressed={viewMode === "calendar"}
              onClick={() => setBookingViewMode("calendar")}
            >
              <CalendarDays size={16} aria-hidden="true" />
              Calendar
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Origin" className="">
              <Select
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              >
                <option value="all">All</option>
                <option value="eventwow">Eventwow</option>
                <option value="external">External</option>
              </Select>
            </FormField>
            <FormField label="From date" className="">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FormField>
            <FormField label="To date" className="">
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </FormField>
            <FormField label="Status" className="">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </Select>
            </FormField>
          </div>
        </CardContent>
      </Card>
      {loading && viewMode !== "calendar" ? (
        <div className="ew-page-stack">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : err ? (
        <Card>
          <CardContent className="py-6">
            <Feedback>{err}</Feedback>
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={load}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="ew-page-stack">
          <Card>
            <CardHeader>
              <CardTitle>
                {viewMode === "calendar" ? "Booking calendar" : "Booking list"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {viewMode === "calendar" ? (
                <Suspense fallback={<p role="status">Loading calendar…</p>}>
                  <BookingsCalendar
                    rows={rows}
                    loading={loading}
                    onSelectBooking={setSelectedId}
                    onRangeChange={handleCalendarRangeChange}
                    currentDate={calendarCurrentDate}
                    currentView={calendarCurrentView}
                    onNavigate={handleCalendarNavigate}
                    onView={handleCalendarView}
                  />
                </Suspense>
              ) : (
                <DataTable
                  className="ew-admin-table"
                  caption="Supplier bookings"
                  rows={rows}
                  emptyTitle="No bookings found"
                  emptyDescription="Try adjusting filters, or add your first external booking."
                  columns={[
                    {
                      key: "customer",
                      label: "Customer",
                      render: (row) => (
                        <div>
                          <button
                            className="ew-text-action"
                            aria-current={
                              selectedId === row.id ? "true" : undefined
                            }
                            onClick={() => setSelectedId(row.id)}
                          >
                            {row.customer_name || "Customer not provided"}
                          </button>
                          <small>
                            {row.location_label || "Location not provided"}
                          </small>
                        </div>
                      ),
                    },
                    {
                      key: "event",
                      label: "Event",
                      render: (row) => (
                        <div>
                          {fmtDate(row.event_date)}
                          {row.start_time ? ` - ${row.start_time}` : ""}
                          <small>
                            {row.event_date
                              ? row.event_date < toDateInputValue(today)
                                ? "Past"
                                : "Upcoming"
                              : "Date unavailable"}{" "}
                            · Guests: {row.guest_count ?? "—"}
                          </small>
                        </div>
                      ),
                    },
                    {
                      key: "origin",
                      label: "Origin",
                      render: (row) =>
                        String(row.origin_type || "").toLowerCase() ===
                        "eventwow"
                          ? "Eventwow"
                          : "External",
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (row) => (
                        <Badge variant={statusBadge(row.status)}>
                          {row.status || "draft"}
                        </Badge>
                      ),
                    },
                    {
                      key: "value",
                      label: "Value",
                      render: (row) =>
                        row.value_gross != null ? money(row.value_gross) : "—",
                    },
                    {
                      key: "payment",
                      label: "Payment",
                      render: (row) => (
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={paymentBadge(row.is_deposit_paid)}>
                            Deposit: {row.is_deposit_paid ? "Paid" : "Unpaid"}
                          </Badge>
                          <Badge variant={paymentBadge(row.is_balance_paid)}>
                            Balance: {row.is_balance_paid ? "Paid" : "Unpaid"}
                          </Badge>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card
            id="supplier-booking-detail"
            aria-label="Booking detail"
            tabIndex={-1}
          >
            <CardHeader>
              <CardTitle>Booking detail</CardTitle>
            </CardHeader>
            <CardContent className="ew-record-details space-y-3">
              {!selectedId ? (
                <EmptyState
                  title="Select a booking"
                  description="Choose a customer in the list or calendar to view details."
                />
              ) : detailLoading ? (
                <p role="status" className="ew-form-help">
                  Loading booking detail...
                </p>
              ) : detailErr ? (
                <Feedback onRetry={() => loadDetail(selectedId)}>
                  {detailErr}
                </Feedback>
              ) : !detail ? (
                <EmptyState title="Booking not found" />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <p>
                      <span className="text-slate-500">Origin:</span>{" "}
                      {detail.origin_type}
                    </p>
                    <p>
                      <span className="ew-muted">Status:</span>{" "}
                      <Badge variant={statusBadge(detail.status)}>
                        {detail.status}
                      </Badge>
                    </p>
                    <p>
                      <span className="text-slate-500">Date:</span>{" "}
                      {fmtDate(detail.event_date)}
                    </p>
                    <p>
                      <span className="text-slate-500">Time:</span>{" "}
                      {detail.start_time || "-"}
                      {detail.end_time ? ` - ${detail.end_time}` : ""}
                    </p>
                    <p>
                      <span className="text-slate-500">Customer:</span>{" "}
                      {detail.customer_name || "Customer not provided"}
                    </p>
                    <p>
                      <span className="text-slate-500">Guests:</span>{" "}
                      {detail.guest_count ?? "-"}
                    </p>
                    <p className="md:col-span-2">
                      <span className="text-slate-500">Location:</span>{" "}
                      {detail.location_label ||
                        detail.location_text ||
                        "Location not provided"}
                    </p>
                    <p>
                      <span className="text-slate-500">Source:</span>{" "}
                      {detail.source_name || "-"}
                    </p>
                    <p>
                      <span className="text-slate-500">Value:</span>{" "}
                      {detail.value_gross !== null &&
                      detail.value_gross !== undefined
                        ? money(detail.value_gross)
                        : "-"}
                    </p>
                    <p>
                      <span className="text-slate-500">Deposit:</span>{" "}
                      {detail.deposit_amount !== null &&
                      detail.deposit_amount !== undefined
                        ? money(detail.deposit_amount)
                        : "-"}
                    </p>
                    <p>
                      <span className="text-slate-500">Balance:</span>{" "}
                      {detail.balance_amount !== null &&
                      detail.balance_amount !== undefined
                        ? money(detail.balance_amount)
                        : "-"}
                    </p>
                    <p>
                      <span className="text-slate-500">Deposit paid:</span>{" "}
                      {detail.is_deposit_paid
                        ? `Yes (${fmtDateTime(detail.deposit_paid_at)})`
                        : "No"}
                    </p>
                    <p>
                      <span className="text-slate-500">Balance paid:</span>{" "}
                      {detail.is_balance_paid
                        ? `Yes (${fmtDateTime(detail.balance_paid_at)})`
                        : "No"}
                    </p>
                  </div>

                  <div className="ew-form-subsection">
                    <p className="mb-1 font-medium text-slate-900">
                      Supplier notes
                    </p>
                    <p className="whitespace-pre-wrap text-slate-700">
                      {detail.supplier_notes || "No notes added."}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Only you can see these notes.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    {detail.enquiry_id ? (
                      <Button
                        as={Link}
                        to={`/supplier/enquiries?open=${encodeURIComponent(detail.enquiry_id)}`}
                        size="sm"
                        variant="secondary"
                      >
                        Open enquiry
                      </Button>
                    ) : null}
                    {detail.quote_id ? (
                      <Button
                        as={Link}
                        to={`/supplier/quotes?open=${encodeURIComponent(detail.quote_id)}`}
                        size="sm"
                        variant="secondary"
                      >
                        Open linked quote
                      </Button>
                    ) : null}
                    {detail.message_thread_id ? (
                      <Button
                        as={Link}
                        to={`/supplier/messages?thread=${encodeURIComponent(detail.message_thread_id)}`}
                        size="sm"
                        variant="secondary"
                      >
                        Open messages
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={openEditBooking}
                    >
                      Edit booking
                    </Button>
                  </div>

                  <div className="ew-form-subsection">
                    <p className="text-sm font-medium text-slate-900">
                      Customer link
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Customer can view booking and quote details anytime. Login
                      is required to message.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={createShareLink}
                        disabled={shareBusy}
                      >
                        {shareBusy ? "Loading..." : "Get link"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={revokeShareLink}
                        disabled={shareBusy || !shareUrl}
                      >
                        Revoke link
                      </Button>
                    </div>
                    {shareUrl ? (
                      <div className="mt-2 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {shareUrl}
                      </div>
                    ) : null}
                    {shareMsg ? (
                      <Feedback
                        tone={
                          shareMsg.toLowerCase().includes("failed")
                            ? "danger"
                            : "warning"
                        }
                      >
                        {shareMsg}
                      </Feedback>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        title="Manage booking sources"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Track where bookings come from (phone, poptop, brochure, etc.).
          </p>
          {sourcesErr ? <Feedback>{sourcesErr}</Feedback> : null}
          <div className="ew-form-subsection">
            <p className="mb-2 text-sm font-medium text-slate-900">
              Add custom source
            </p>
            <div className="flex gap-2">
              <Input
                aria-label="New source name"
                placeholder="e.g. Wedding brochure"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                onClick={addSource}
                disabled={sourceBusyId === "new"}
              >
                {sourceBusyId === "new" ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
          <div className="ew-form-subsection">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">Sources</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={ensureSourceDefaults}
                disabled={sourceBusyId === "ensure-defaults"}
              >
                {sourceBusyId === "ensure-defaults"
                  ? "Ensuring..."
                  : "Ensure defaults"}
              </Button>
            </div>
            {sourcesLoading ? (
              <p role="status" className="ew-form-help">
                Loading sources...
              </p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-slate-600">No sources yet.</p>
            ) : (
              <div className="space-y-2">
                {sources.map((source) => (
                  <div key={source.id} className="ew-form-subsection">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={`Source name: ${source.name}`}
                        value={source.name}
                        onChange={(e) =>
                          setSources((prev) =>
                            prev.map((row) =>
                              row.id === source.id
                                ? { ...row, name: e.target.value }
                                : row,
                            ),
                          )
                        }
                        disabled={source.is_default}
                      />
                      <span className="ew-form-help">
                        {source.is_default ? "Default" : "Custom"}
                      </span>
                      <label className="flex items-center gap-1 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!source.is_active}
                          onChange={(e) =>
                            patchSource(source.id, {
                              is_active: e.target.checked,
                            })
                          }
                          disabled={sourceBusyId === source.id}
                        />
                        Active
                      </label>
                      {!source.is_default ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patchSource(source.id, {
                              name: source.name,
                              is_active: source.is_active,
                            })
                          }
                          disabled={sourceBusyId === source.id}
                        >
                          {sourceBusyId === source.id ? "Saving..." : "Save"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        title={
          bookingModalMode === "create"
            ? "Add external booking"
            : `Edit booking${selectedRow ? ` - ${selectedRow.customer_name || "booking"}` : ""}`
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBookingModalOpen(false)}
              disabled={bookingBusy}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveBooking} disabled={bookingBusy}>
              {bookingBusy ? "Saving..." : "Save booking"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {bookingErr ? <Feedback>{bookingErr}</Feedback> : null}
          <div className="ew-form-subsection">
            <p className="mb-2 text-sm font-medium text-slate-900">
              Event details
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FormField label="Date" className="">
                <Input
                  type="date"
                  value={bookingForm.event_date}
                  onChange={(e) => setFormField("event_date", e.target.value)}
                />
              </FormField>
              <FormField label="Status" className="">
                <Select
                  value={bookingForm.status}
                  onChange={(e) => setFormField("status", e.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </Select>
              </FormField>
              <FormField label="Start time" className="">
                <Input
                  type="time"
                  value={bookingForm.start_time}
                  onChange={(e) => setFormField("start_time", e.target.value)}
                />
              </FormField>
              <FormField label="End time" className="">
                <Input
                  type="time"
                  value={bookingForm.end_time}
                  onChange={(e) => setFormField("end_time", e.target.value)}
                />
              </FormField>
              <FormField label="Location" className="sm:col-span-2">
                <Input
                  value={bookingForm.location_text}
                  onChange={(e) =>
                    setFormField("location_text", e.target.value)
                  }
                  placeholder="Town, venue, postcode"
                />
              </FormField>
              <FormField label="Guests" className="">
                <Input
                  type="number"
                  min="0"
                  value={bookingForm.guest_count}
                  onChange={(e) => setFormField("guest_count", e.target.value)}
                />
              </FormField>
              <FormField label="Source" className="">
                <Select
                  value={bookingForm.source_id}
                  onChange={(e) => setFormField("source_id", e.target.value)}
                >
                  <option value="">No source</option>
                  {activeSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
          <div className="ew-form-subsection">
            <p className="mb-2 text-sm font-medium text-slate-900">
              Customer (optional)
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FormField label="Name" className="">
                <Input
                  value={bookingForm.customer_name}
                  onChange={(e) =>
                    setFormField("customer_name", e.target.value)
                  }
                />
              </FormField>
              <FormField label="Phone" className="">
                <Input
                  value={bookingForm.customer_phone}
                  onChange={(e) =>
                    setFormField("customer_phone", e.target.value)
                  }
                />
              </FormField>
              <FormField label="Email" className="sm:col-span-2">
                <Input
                  type="email"
                  value={bookingForm.customer_email}
                  onChange={(e) =>
                    setFormField("customer_email", e.target.value)
                  }
                />
              </FormField>
            </div>
          </div>
          <div className="ew-form-subsection">
            <p className="mb-2 text-sm font-medium text-slate-900">
              Financials and payment
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FormField label="Gross value" className="">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bookingForm.value_gross}
                  onChange={(e) => setFormField("value_gross", e.target.value)}
                />
              </FormField>
              <FormField label="Deposit" className="">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bookingForm.deposit_amount}
                  onChange={(e) =>
                    setFormField("deposit_amount", e.target.value)
                  }
                />
              </FormField>
              <FormField label="Balance" className="">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bookingForm.balance_amount}
                  onChange={(e) =>
                    setFormField("balance_amount", e.target.value)
                  }
                />
              </FormField>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!bookingForm.is_deposit_paid}
                  onChange={(e) =>
                    setFormField("is_deposit_paid", e.target.checked)
                  }
                />
                Deposit paid
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!bookingForm.is_balance_paid}
                  onChange={(e) =>
                    setFormField("is_balance_paid", e.target.checked)
                  }
                />
                Balance paid
              </label>
            </div>
          </div>
          <div className="ew-form-subsection">
            <p className="mb-2 text-sm font-medium text-slate-900">
              Supplier notes
            </p>
            <Textarea
              aria-label="Supplier notes"
              value={bookingForm.supplier_notes}
              onChange={(e) => setFormField("supplier_notes", e.target.value)}
              placeholder="Only you can see this"
            />
            <p className="mt-1 text-xs text-slate-500">
              Never shown to customers.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
