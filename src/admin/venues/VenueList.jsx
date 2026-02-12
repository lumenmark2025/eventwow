import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugify } from "../../utils/slugify";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

function VenueSupplierLinks({ venueId, user }) {
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [links, setLinks] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr("");
    setLoading(true);

    const [{ data: suppliers, error: sErr }, { data: linkRows, error: lErr }] = await Promise.all([
      supabase
        .from("suppliers")
        .select("id,business_name")
        .eq("is_published", true)
        .order("business_name", { ascending: true }),
      supabase
        .from("venue_suppliers")
        .select("id,venue_id,supplier_id,is_trusted,display_order,created_at,suppliers(id,business_name)")
        .eq("venue_id", venueId)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

    if (sErr) setErr(sErr.message);
    if (lErr) setErr(lErr.message);

    setAllSuppliers(suppliers || []);
    setLinks(linkRows || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [venueId]);

  async function addLink() {
    if (!selectedSupplierId) return;
    setBusy(true);
    setErr("");

    const { error } = await supabase.from("venue_suppliers").insert({
      venue_id: venueId,
      supplier_id: selectedSupplierId,
      is_trusted: true,
      display_order: null,
      created_by_user_id: user.id,
    });

    if (error) {
      if (String(error.message || "").toLowerCase().includes("duplicate key")) {
        setErr("That supplier is already linked to this venue.");
      } else {
        setErr(error.message);
      }
    } else {
      setSelectedSupplierId("");
      await load();
    }

    setBusy(false);
  }

  async function updateLink(linkId, patch) {
    setBusy(true);
    setErr("");

    const { error } = await supabase
      .from("venue_suppliers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", linkId);

    if (error) setErr(error.message);
    else await load();

    setBusy(false);
  }

  async function removeLink(linkId) {
    setBusy(true);
    setErr("");

    const { error } = await supabase.from("venue_suppliers").delete().eq("id", linkId);

    if (error) setErr(error.message);
    else await load();

    setBusy(false);
  }

  const linkedSupplierIds = new Set(links.map((l) => l.supplier_id));
  const available = allSuppliers.filter((s) => !linkedSupplierIds.has(s.id));

  return (
    <Section title="Trusted suppliers">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
            >
              <option value="">Select supplier to add...</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.business_name}
                </option>
              ))}
            </select>
            <Button type="button" onClick={addLink} disabled={busy || !selectedSupplierId}>
              Add supplier
            </Button>
          </div>

          {err ? <p className="text-sm text-rose-600">{err}</p> : null}

          {links.length === 0 ? (
            <EmptyState title="No suppliers linked" description="Add trusted suppliers for this venue." />
          ) : (
            <div className="space-y-2">
              {links.map((l) => (
                <Card key={l.id}>
                  <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{l.suppliers?.business_name ?? "Supplier"}</p>
                      <p className="text-xs text-slate-500">Supplier ID: {l.supplier_id}</p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!!l.is_trusted}
                        onChange={(e) => updateLink(l.id, { is_trusted: e.target.checked })}
                        disabled={busy}
                      />
                      Trusted
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Order</span>
                      <Input
                        className="w-20"
                        type="number"
                        value={l.display_order ?? ""}
                        placeholder="-"
                        onChange={(e) => {
                          const v = e.target.value;
                          updateLink(l.id, { display_order: v === "" ? null : Number(v) });
                        }}
                        disabled={busy}
                      />
                    </div>

                    <Button type="button" variant="secondary" onClick={() => removeLink(l.id)} disabled={busy}>
                      Remove
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function VenueEdit({ venueId, user, onBack, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [form, setForm] = useState({
    name: "",
    slug: "",
    city: "",
    postcode: "",
    description: "",
    website_url: "",
    is_published: true,
  });

  useEffect(() => {
    (async () => {
      setErr("");
      setOk("");
      setLoading(true);

      const { data, error } = await supabase
        .from("venues")
        .select("id,name,slug,city,postcode,description,website_url,is_published")
        .eq("id", venueId)
        .maybeSingle();

      if (error) setErr(error.message);
      else if (!data) setErr("Venue not found.");
      else {
        setForm({
          name: data.name ?? "",
          slug: data.slug ?? "",
          city: data.city ?? "",
          postcode: data.postcode ?? "",
          description: data.description ?? "",
          website_url: data.website_url ?? "",
          is_published: !!data.is_published,
        });
      }

      setLoading(false);
    })();
  }, [venueId]);

  function setField(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setErr("");
    setOk("");
    setSaving(true);

    const name = form.name.trim();
    const slug = slugify(form.slug || form.name);

    if (!name) {
      setErr("Name is required.");
      setSaving(false);
      return;
    }
    if (!slug) {
      setErr("Slug is required.");
      setSaving(false);
      return;
    }

    const payload = {
      name,
      slug,
      city: form.city.trim() || null,
      postcode: form.postcode.trim() || null,
      description: form.description.trim() || null,
      website_url: form.website_url.trim() || null,
      is_published: !!form.is_published,
      updated_by_user_id: user.id,
    };

    const { error } = await supabase.from("venues").update(payload).eq("id", venueId);

    if (error) {
      if (String(error.message || "").toLowerCase().includes("venues_slug_key")) {
        setErr("That slug is already in use. Try adding the town or a number.");
      } else setErr(error.message);
    } else {
      setOk("Saved.");
      await onSaved?.();
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit venue"
        subtitle="Manage venue details and trusted suppliers."
        actions={[
          { key: "back", label: "Back", variant: "secondary", onClick: onBack },
          { key: "save", label: saving ? "Saving..." : "Save changes", onClick: save, disabled: saving },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{form.name || "Venue"}</CardTitle>
          <CardDescription>Core profile fields for discovery and referrals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Name *</label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Slug *</label>
              <Input
                value={form.slug}
                onChange={(e) => setField("slug", e.target.value)}
                onBlur={() => setField("slug", slugify(form.slug || form.name))}
              />
              <p className="text-xs text-slate-500">Used in URL and auto-cleaned on blur.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">City</label>
              <Input value={form.city} onChange={(e) => setField("city", e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Postcode</label>
              <Input value={form.postcode} onChange={(e) => setField("postcode", e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Website URL</label>
              <Input value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Description</label>
              <textarea
                className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="published"
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setField("is_published", e.target.checked)}
            />
            Published
          </label>

          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
          {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <VenueSupplierLinks venueId={venueId} user={user} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function VenueList({ user }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedVenueId, setSelectedVenueId] = useState(null);

  async function loadVenues() {
    setErr("");
    setLoading(true);
    const { data, error } = await supabase
      .from("venues")
      .select("id,name,slug,city,postcode,is_published,created_at")
      .order("created_at", { ascending: false });

    if (error) setErr(error.message);
    else setVenues(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadVenues();
  }, []);

  async function createVenue(e) {
    e.preventDefault();
    setErr("");
    setSaving(true);

    const slug = slugify(name);
    if (!name || !slug) {
      setErr("Venue name is required.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("venues").insert({
      name,
      slug,
      city: city || null,
      postcode: postcode || null,
      created_by_user_id: user.id,
      updated_by_user_id: user.id,
      is_published: true,
      country_code: "GB",
    });

    if (error) setErr(error.message);
    else {
      setName("");
      setCity("");
      setPostcode("");
      await loadVenues();
    }

    setSaving(false);
  }

  if (selectedVenueId) {
    return (
      <VenueEdit
        venueId={selectedVenueId}
        user={user}
        onBack={() => setSelectedVenueId(null)}
        onSaved={loadVenues}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Venues"
        subtitle="Create and maintain venue records used across the marketplace."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add venue</CardTitle>
          <CardDescription>Create a venue profile and publish it immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createVenue} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input placeholder="Venue name *" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
              <Input placeholder="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </div>
            {err ? <p className="text-sm text-rose-600">{err}</p> : null}
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create venue"}</Button>
          </form>
        </CardContent>
      </Card>

      <Section title="Venue list" right={<Badge variant="neutral">{venues.length} total</Badge>}>
        <Card className="overflow-hidden">
          {loading ? (
            <CardContent className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          ) : venues.length === 0 ? (
            <CardContent>
              <EmptyState title="No venues yet" description="Create your first venue to start linking trusted suppliers." />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Slug</TH>
                    <TH>City</TH>
                    <TH>Postcode</TH>
                    <TH>Published</TH>
                  </TR>
                </THead>
                <TBody>
                  {venues.map((v) => (
                    <TR
                      key={v.id}
                      interactive
                      className="cursor-pointer"
                      onClick={() => setSelectedVenueId(v.id)}
                      title="Click to edit"
                    >
                      <TD className="font-medium text-slate-900">{v.name}</TD>
                      <TD className="text-slate-600">{v.slug}</TD>
                      <TD>{v.city || "-"}</TD>
                      <TD>{v.postcode || "-"}</TD>
                      <TD>
                        <Badge variant={v.is_published ? "success" : "neutral"}>
                          {v.is_published ? "Published" : "Hidden"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
