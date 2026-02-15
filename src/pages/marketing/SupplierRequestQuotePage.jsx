import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
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

function getPrompt(eventType, categorySlug) {
  if (categorySlug === "pizza-catering") {
    return "Where is the event and roughly how many guests? Is there power available and what time should serving start?";
  }
  if (eventType === "wedding") {
    return "What is your venue and guest count? Include dietary requirements if relevant.";
  }
  if (eventType === "corporate") {
    return "Is this staff catering or a client event? Include service window and delivery constraints.";
  }
  return "Share the event context, timings, guest count, venue, and any special requirements.";
}

function buildSuggestionHints(form) {
  const hints = [];
  if (!form.guest_count) hints.push("add guest count");
  if (!form.event_date) hints.push("add event date");
  if (!form.venue_name && !form.venue_postcode) hints.push("add venue name or postcode");
  if (!form.start_time) hints.push("add preferred serving time");
  if (!form.dietary_requirements) hints.push("add dietary requirements if relevant");
  return hints;
}

export default function SupplierRequestQuotePage() {
  const navigate = useNavigate();
  const { slug } = useParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [serverHints, setServerHints] = useState([]);
  const [context, setContext] = useState(null);

  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState([]);
  const [showVenueResults, setShowVenueResults] = useState(false);
  const [venuesLoading, setVenuesLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    event_type: "",
    event_date: "",
    start_time: "",
    guest_count: "",
    budget_range: "",
    venue_known: false,
    venue_name: "",
    venue_id: "",
    venue_postcode: "",
    enquiry_category_slug: "",
    indoor_outdoor: "",
    power_available: null,
    dietary_requirements: "",
    contact_preference: "email",
    urgency: "",
    message: "",
  });

  const categoryOptions = context?.activeCategories || [];
  const isSingleCategory = categoryOptions.length === 1;
  const categorySlug = isSingleCategory ? categoryOptions[0]?.slug || "" : form.enquiry_category_slug;
  const showPowerToggle = categorySlug === "pizza-catering";
  const prompt = useMemo(() => getPrompt(form.event_type, categorySlug), [form.event_type, categorySlug]);
  const suggestions = useMemo(() => buildSuggestionHints(form), [form]);
  const messageLength = String(form.message || "").trim().length;

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
        const firstCategorySlug = (json?.activeCategories || [])[0]?.slug || "";
        setForm((prev) => ({
          ...prev,
          enquiry_category_slug: json?.activeCategoryCount === 1 ? firstCategorySlug : prev.enquiry_category_slug,
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
    if (key === "venue_name") {
      setVenueQuery(String(value || ""));
      setShowVenueResults(true);
      setForm((prev) => ({ ...prev, venue_name: value, venue_id: "", venue_postcode: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectVenue(v) {
    setForm((prev) => ({
      ...prev,
      venue_name: v.name,
      venue_id: v.id,
      venue_postcode: v.postcode || "",
      venue_known: true,
    }));
    setVenueQuery(v.name);
    setShowVenueResults(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setServerHints([]);

    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!isSingleCategory && !form.enquiry_category_slug.trim()) {
      setError("Please choose a category for this supplier.");
      return;
    }
    if (messageLength < 80) {
      setError("Please provide at least 80 characters in your message.");
      return;
    }
    if (form.venue_known && !form.venue_name.trim() && !form.venue_postcode.trim()) {
      setError("If venue is known, add venue name or postcode.");
      return;
    }
    if ((form.event_type === "wedding" || form.event_type === "corporate" || form.event_type === "festival") && !parseGuestCount(form.guest_count)) {
      setError("Guest count is required for this event type.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: context?.supplierId,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        event_type: form.event_type || null,
        enquiry_category_slug: categorySlug || null,
        event_date: form.event_date || null,
        start_time: form.start_time || null,
        guest_count: parseGuestCount(form.guest_count),
        budget_range: form.budget_range || null,
        venue_known: !!form.venue_known,
        venue_name: form.venue_name || null,
        venue_id: form.venue_id || null,
        venue_postcode: form.venue_postcode || null,
        indoor_outdoor: form.indoor_outdoor || null,
        power_available: showPowerToggle ? form.power_available : null,
        dietary_requirements: form.dietary_requirements || null,
        contact_preference: form.contact_preference || "email",
        urgency: form.urgency || null,
        message: form.message,
        source_page: `/suppliers/${slug}/request-quote`,
        structured_answers: {},
      };
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";

      const resp = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setServerHints(Array.isArray(json?.hints) ? json.hints : []);
        throw new Error(json?.details || json?.error || "Failed to submit request");
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
              Share structured event details so suppliers can respond with better quotes.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input placeholder="Your name *" value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} required />
                <Input type="email" placeholder="Email *" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
                <Input placeholder="Phone" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  value={form.event_type}
                  onChange={(e) => setField("event_type", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Event type</option>
                  <option value="wedding">Wedding</option>
                  <option value="corporate">Corporate</option>
                  <option value="birthday">Birthday</option>
                  <option value="festival">Festival</option>
                  <option value="school">School</option>
                  <option value="other">Other</option>
                </select>

                {isSingleCategory ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                    <span className="text-sm text-slate-600">Category:</span>
                    <Badge variant="brand">{categoryOptions[0]?.name}</Badge>
                  </div>
                ) : (
                  <select
                    value={form.enquiry_category_slug}
                    onChange={(e) => setField("enquiry_category_slug", e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.slug}>{cat.name}</option>
                    ))}
                  </select>
                )}

                <select
                  value={form.contact_preference}
                  onChange={(e) => setField("contact_preference", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="email">Email preferred</option>
                  <option value="phone">Phone preferred</option>
                  <option value="whatsapp">WhatsApp preferred</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input type="date" value={form.event_date} onChange={(e) => setField("event_date", e.target.value)} />
                <Input type="time" value={form.start_time} onChange={(e) => setField("start_time", e.target.value)} />
                <Input type="number" min={1} placeholder="Guest count" value={form.guest_count} onChange={(e) => setField("guest_count", e.target.value)} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  value={form.budget_range}
                  onChange={(e) => setField("budget_range", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Budget range</option>
                  <option value="<£500">&lt;£500</option>
                  <option value="£500-£1000">£500-£1000</option>
                  <option value="£1000-£2500">£1000-£2500</option>
                  <option value="£2500+">£2500+</option>
                </select>
                <select
                  value={form.indoor_outdoor}
                  onChange={(e) => setField("indoor_outdoor", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Indoor/outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="mixed">Mixed</option>
                  <option value="unknown">Not sure</option>
                </select>
                <select
                  value={form.urgency}
                  onChange={(e) => setField("urgency", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Urgency</option>
                  <option value="flexible">Flexible</option>
                  <option value="soon">Soon</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.venue_known}
                    onChange={(e) => setField("venue_known", e.target.checked)}
                  />
                  Venue already confirmed
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="relative">
                    <Input
                      placeholder="Venue / Location name"
                      value={form.venue_name}
                      onChange={(e) => setField("venue_name", e.target.value)}
                      onFocus={() => setShowVenueResults(true)}
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
                  <Input
                    placeholder="Venue postcode"
                    value={form.venue_postcode}
                    onChange={(e) => setField("venue_postcode", e.target.value)}
                  />
                </div>
              </div>

              {showPowerToggle ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">Is power available on-site?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant={form.power_available === true ? "primary" : "secondary"} onClick={() => setField("power_available", true)}>
                      Yes
                    </Button>
                    <Button type="button" variant={form.power_available === false ? "primary" : "secondary"} onClick={() => setField("power_available", false)}>
                      No
                    </Button>
                    <Button type="button" variant={form.power_available === null ? "primary" : "secondary"} onClick={() => setField("power_available", null)}>
                      Not sure
                    </Button>
                  </div>
                </div>
              ) : null}

              <Input
                placeholder="Dietary requirements (optional)"
                value={form.dietary_requirements}
                onChange={(e) => setField("dietary_requirements", e.target.value)}
              />

              <div>
                <p className="mb-1 text-sm text-slate-600">{prompt}</p>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  placeholder="Include guest count, venue details, budget guidance, and timing."
                  value={form.message}
                  onChange={(e) => setField("message", e.target.value)}
                />
                <p className={`mt-1 text-xs ${messageLength < 80 ? "text-amber-700" : "text-slate-500"}`}>
                  Minimum 80 characters. Current: {messageLength}
                </p>
              </div>

              {(suggestions.length > 0 || serverHints.length > 0) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Suggestions: {Array.from(new Set([...suggestions, ...serverHints])).join(" • ")}
                </div>
              ) : null}

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
