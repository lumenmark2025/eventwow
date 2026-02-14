import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useMarketingMeta } from "../../lib/marketingMeta";

const CATEGORY_OPTIONS = [
  "Pizza Catering",
  "Photographers",
  "DJs",
  "Venues",
  "Florists",
  "Bands",
  "Decor",
  "Cakes",
];

export default function RequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    eventDate: "",
    eventTime: "",
    locationLabel: "",
    postcode: "",
    guestCount: "",
    categoryId: "",
    message: "",
  });

  useEffect(() => {
    const initialCategory = String(searchParams.get("category") || "").trim();
    if (initialCategory) {
      setForm((prev) => ({ ...prev, categoryId: initialCategory }));
    }
  }, [searchParams]);

  useMarketingMeta({
    title: "Request quotes",
    description: "Send one request and get matched with trusted suppliers.",
    path: "/request",
  });

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const resp = await fetch("/api/public-create-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          guestCount: form.guestCount ? Number(form.guestCount) : null,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to submit enquiry");
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input placeholder="Your name *" value={form.customerName} onChange={(e) => setField("customerName", e.target.value)} required />
                <Input type="email" placeholder="Email *" value={form.customerEmail} onChange={(e) => setField("customerEmail", e.target.value)} required />
                <Input placeholder="Phone" value={form.customerPhone} onChange={(e) => setField("customerPhone", e.target.value)} />
                <Input placeholder="Location label *" value={form.locationLabel} onChange={(e) => setField("locationLabel", e.target.value)} required />
                <Input type="date" value={form.eventDate} onChange={(e) => setField("eventDate", e.target.value)} />
                <Input placeholder="Event time" value={form.eventTime} onChange={(e) => setField("eventTime", e.target.value)} />
                <Input placeholder="Postcode" value={form.postcode} onChange={(e) => setField("postcode", e.target.value)} />
                <Input type="number" min={1} placeholder="Guest count" value={form.guestCount} onChange={(e) => setField("guestCount", e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category (optional)</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setField("categoryId", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                >
                  <option value="">Any category</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Event details</label>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  placeholder="Tell suppliers what you need"
                  value={form.message}
                  onChange={(e) => setField("message", e.target.value)}
                />
              </div>

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
