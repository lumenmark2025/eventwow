import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { useMarketingMeta } from "../../lib/marketingMeta";

function parseGuestCount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function getSuggestedFields(state) {
  const suggestions = [];
  const guests = parseGuestCount(state.guestCount);
  if (guests && guests > 150) {
    suggestions.push("servingTimeWindow", "accessNotes");
  }
  if (String(state.indoorOutdoor || "").toLowerCase() === "outdoor") {
    suggestions.push("accessNotes");
  }
  return Array.from(new Set(suggestions));
}

function usefulDetailsOk(state) {
  const notesLen = String(state.notes || "").trim().length;
  const structured = [
    state.servingTimeWindow,
    state.indoorOutdoor,
    state.dietarySummary,
    state.accessNotes,
  ].filter((x) => String(x || "").trim().length > 0).length;
  return notesLen >= 40 || structured >= 2;
}

export default function SupplierRequestQuotePage() {
  const navigate = useNavigate();
  const { slug } = useParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);

  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState([]);
  const [showVenueResults, setShowVenueResults] = useState(false);
  const [venuesLoading, setVenuesLoading] = useState(false);

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    eventDate: "",
    dateUnknown: false,
    guestCount: "",
    venueName: "",
    venueId: "",
    venuePostcode: "",
    categoryId: "",
    servingTimeWindow: "",
    indoorOutdoor: "",
    dietarySummary: "",
    accessNotes: "",
    notes: "",
  });

  const suggestedFields = useMemo(() => getSuggestedFields(form), [form]);
  const categoryOptions = context?.activeCategories || [];
  const isSingleCategory = categoryOptions.length === 1;

  useMarketingMeta({
    title: context?.supplierName ? `Request a quote from ${context.supplierName}` : "Request a quote",
    description: context?.supplierName
      ? `Tell us your event details and ${context.supplierName} will send a quote.`
      : "Tell us your event details and receive a quote.",
    path: `/suppliers/${slug || ""}/request-quote`,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(
          `/api/public-supplier-request-context?supplierSlug=${encodeURIComponent(String(slug || ""))}`
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Supplier unavailable");
        if (!mounted) return;
        setContext(json);
        const firstCategory = (json?.activeCategories || [])[0]?.name || "";
        setForm((prev) => ({
          ...prev,
          categoryId: json?.activeCategoryCount === 1 ? firstCategory : prev.categoryId,
        }));
      } catch (err) {
        if (mounted) setError(err?.message || "Supplier unavailable");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    const q = String(venueQuery || "").trim();
    if (q.length < 2) {
      setVenueResults([]);
      return;
    }
    let mounted = true;
    const timeout = setTimeout(async () => {
      setVenuesLoading(true);
      try {
        const resp = await fetch(`/api/public-venues-search?q=${encodeURIComponent(q)}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Venue search failed");
        if (!mounted) return;
        setVenueResults(json?.rows || []);
      } catch {
        if (mounted) setVenueResults([]);
      } finally {
        if (mounted) setVenuesLoading(false);
      }
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [venueQuery]);

  function setField(key, value) {
    if (key === "venueName") {
      setVenueQuery(String(value || ""));
      setShowVenueResults(true);
      setForm((prev) => ({ ...prev, venueName: value, venueId: "", venuePostcode: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectVenue(v) {
    setForm((prev) => ({
      ...prev,
      venueName: v.name,
      venueId: v.id,
      venuePostcode: v.postcode || "",
    }));
    setVenueQuery(v.name);
    setShowVenueResults(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.customerName.trim() || !form.customerEmail.trim() || !form.customerPhone.trim()) {
      setError("Name, email, and phone are required.");
      return;
    }
    if (!form.dateUnknown && !form.eventDate) {
      setError("Provide event date or select date unknown.");
      return;
    }
    if (!parseGuestCount(form.guestCount)) {
      setError("Guest count is required.");
      return;
    }
    if (!form.venueName.trim()) {
      setError("Venue / location name is required.");
      return;
    }
    if (!isSingleCategory && !form.categoryId.trim()) {
      setError("Please choose a category for this supplier.");
      return;
    }
    if (!usefulDetailsOk(form)) {
      setError("Add notes (40+ chars) or complete at least 2 structured details.");
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch("/api/public-create-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: context?.supplierId,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          eventDate: form.eventDate || null,
          dateUnknown: !!form.dateUnknown,
          guestCount: parseGuestCount(form.guestCount),
          venueName: form.venueName,
          venueId: form.venueId || null,
          postcode: form.venuePostcode || null,
          categoryId: isSingleCategory ? categoryOptions[0]?.name || "" : form.categoryId,
          locationLabel: form.venueName,
          eventTime: null,
          servingTimeWindow: form.servingTimeWindow,
          indoorOutdoor: form.indoorOutdoor,
          dietarySummary: form.dietarySummary,
          accessNotes: form.accessNotes,
          message: form.notes,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const gateReasons = Array.isArray(json?.gate?.reasons) ? json.gate.reasons.join(" ") : "";
        throw new Error(gateReasons || json?.details || json?.error || "Failed to submit request");
      }
      if (!json?.publicToken) throw new Error("Missing enquiry token");
      navigate(`/enquiry/${encodeURIComponent(json.publicToken)}`);
    } catch (err) {
      setError(err?.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <MarketingShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </MarketingShell>
    );
  }

  if (!context) {
    return (
      <MarketingShell>
        <EmptyState title="Supplier unavailable" description={error || "Please try another supplier."} />
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl space-y-5">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              Request a quote from {context.supplierName}
            </CardTitle>
            <p className="text-sm text-slate-600">
              Tell us a few details and {context.supplierName} will send a quote.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input placeholder="Your name *" value={form.customerName} onChange={(e) => setField("customerName", e.target.value)} required />
                <Input type="email" placeholder="Email *" value={form.customerEmail} onChange={(e) => setField("customerEmail", e.target.value)} required />
                <Input placeholder="Phone *" value={form.customerPhone} onChange={(e) => setField("customerPhone", e.target.value)} required />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setField("eventDate", e.target.value)}
                  disabled={form.dateUnknown}
                />
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.dateUnknown}
                    onChange={(e) => setField("dateUnknown", e.target.checked)}
                  />
                  Date not confirmed yet
                </label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Guest count *"
                  value={form.guestCount}
                  onChange={(e) => setField("guestCount", e.target.value)}
                  required
                />
                <div className="relative">
                  <Input
                    placeholder="Venue / Location name *"
                    value={form.venueName}
                    onChange={(e) => setField("venueName", e.target.value)}
                    onFocus={() => setShowVenueResults(true)}
                    required
                  />
                  {showVenueResults && (venueResults.length > 0 || venuesLoading) ? (
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {venuesLoading ? (
                        <div className="px-3 py-2 text-sm text-slate-500">Searching venues...</div>
                      ) : (
                        venueResults.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => selectVenue(v)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <div className="font-medium text-slate-900">{v.name}</div>
                            <div className="text-xs text-slate-500">
                              {[v.town, v.postcode].filter(Boolean).join(" - ")}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {isSingleCategory ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Category:</span>
                  <Badge variant="brand">{categoryOptions[0]?.name}</Badge>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setField("categoryId", e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  placeholder="Serving time window (e.g. 6-8pm)"
                  value={form.servingTimeWindow}
                  onChange={(e) => setField("servingTimeWindow", e.target.value)}
                />
                <select
                  value={form.indoorOutdoor}
                  onChange={(e) => setField("indoorOutdoor", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Indoor / outdoor?</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="mixed">Mixed</option>
                </select>
                <Input
                  placeholder="Dietary requirements summary"
                  value={form.dietarySummary}
                  onChange={(e) => setField("dietarySummary", e.target.value)}
                />
                <Input
                  placeholder="Access / parking notes"
                  value={form.accessNotes}
                  onChange={(e) => setField("accessNotes", e.target.value)}
                />
              </div>

              {suggestedFields.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Suggested next:{" "}
                  {suggestedFields
                    .map((f) =>
                      f === "servingTimeWindow"
                        ? "Serving time window"
                        : f === "accessNotes"
                          ? "Access/parking notes"
                          : f
                    )
                    .join(", ")}
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Event details / notes</label>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  placeholder="Tell us about vibe, timings, priorities, and any special requirements."
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Provide at least 40 characters, or complete at least 2 structured detail fields.
                </p>
              </div>

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Send request"}
                </Button>
                <Button as={Link} to={`/suppliers/${slug}`} variant="secondary">
                  Back to supplier
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
