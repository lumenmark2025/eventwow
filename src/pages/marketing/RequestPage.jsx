import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useMarketingMeta } from "../../lib/marketingMeta";

const CATEGORY_OPTIONS = [
  { slug: "pizza-catering", label: "Pizza Catering" },
  { slug: "wedding-caterers", label: "Wedding Caterers" },
  { slug: "photographers", label: "Photographers" },
  { slug: "djs", label: "DJs" },
  { slug: "venues", label: "Venues" },
  { slug: "florists", label: "Florists" },
  { slug: "bands", label: "Bands" },
  { slug: "decor", label: "Decor" },
];

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function categoryPrompt(eventType, categorySlug) {
  if (categorySlug === "pizza-catering") {
    return "Where is the event and roughly how many guests? Is there power available and your preferred serving time?";
  }
  if (eventType === "wedding") {
    return "What is your venue and guest count? Any dietary requirements?";
  }
  if (eventType === "corporate") {
    return "Is this staff catering or a client event? Include expected serving window.";
  }
  return "Describe your event goals, timing, guest count, venue details, and any special requirements.";
}

function messageHints(form) {
  const hints = [];
  if (!form.guest_count) hints.push("Add guest count");
  if (!form.venue_name && !form.venue_postcode) hints.push("Add venue name or postcode");
  if (!form.start_time) hints.push("Add preferred serving time");
  if (!form.dietary_requirements) hints.push("Add dietary requirements if relevant");
  return hints;
}

export default function RequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [serverHints, setServerHints] = useState([]);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    event_type: "",
    enquiry_category_slug: "",
    event_date: "",
    start_time: "",
    guest_count: "",
    budget_range: "",
    venue_known: false,
    venue_name: "",
    venue_postcode: "",
    indoor_outdoor: "",
    power_available: null,
    dietary_requirements: "",
    contact_preference: "email",
    urgency: "",
    message: "",
  });

  useEffect(() => {
    const initialCategory = slugify(searchParams.get("category") || "");
    if (initialCategory) {
      setForm((prev) => ({ ...prev, enquiry_category_slug: initialCategory }));
    }
  }, [searchParams]);

  useMarketingMeta({
    title: "Request quotes",
    description: "Send one request and get matched with trusted suppliers.",
    path: "/request",
  });

  const prompt = useMemo(
    () => categoryPrompt(form.event_type, form.enquiry_category_slug),
    [form.event_type, form.enquiry_category_slug]
  );
  const inlineHints = useMemo(() => messageHints(form), [form]);
  const messageLength = String(form.message || "").trim().length;
  const showPower = form.enquiry_category_slug === "pizza-catering";

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setServerHints([]);
    setSaving(true);
    try {
      const payload = {
        ...form,
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        power_available: showPower ? form.power_available : null,
        source_page: "/request",
        structured_answers: {},
      };
      const resp = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setServerHints(Array.isArray(json?.hints) ? json.hints : []);
        throw new Error(json?.details || json?.error || "Failed to submit enquiry");
      }
      if (!json?.publicToken) throw new Error("No enquiry token returned");
      navigate(`/enquiry/${encodeURIComponent(json.publicToken)}`);
    } catch (error) {
      setErr(error?.message || "Failed to submit enquiry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl space-y-5">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">Request quotes from trusted suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
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

                <select
                  value={form.enquiry_category_slug}
                  onChange={(e) => setField("enquiry_category_slug", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Category</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>{cat.label}</option>
                  ))}
                </select>

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
                  <input type="checkbox" checked={form.venue_known} onChange={(e) => setField("venue_known", e.target.checked)} />
                  Venue already confirmed
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input placeholder="Venue name" value={form.venue_name} onChange={(e) => setField("venue_name", e.target.value)} />
                  <Input placeholder="Venue postcode" value={form.venue_postcode} onChange={(e) => setField("venue_postcode", e.target.value)} />
                </div>
              </div>

              {showPower ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">Power available on-site?</p>
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
                  placeholder="Example: We need catering for 120 guests at Lancaster Town Hall on 18 July. Service from 6pm, with vegetarian and gluten-free options."
                  value={form.message}
                  onChange={(e) => setField("message", e.target.value)}
                />
                <p className={`mt-1 text-xs ${messageLength < 80 ? "text-amber-700" : "text-slate-500"}`}>
                  Minimum 80 characters. Current: {messageLength}
                </p>
              </div>

              {(inlineHints.length > 0 || serverHints.length > 0) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Suggestions: {Array.from(new Set([...inlineHints, ...serverHints])).join(" • ")}
                </div>
              ) : null}

              {err ? <p className="text-sm text-rose-600">{err}</p> : null}

              <Button type="submit" disabled={saving}>
                {saving ? "Submitting..." : "Send request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
