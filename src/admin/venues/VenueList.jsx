import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugify } from "../../utils/slugify";

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
      // Common: unique constraint (already linked)
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

  // Filter dropdown to suppliers not already linked
  const linkedSupplierIds = new Set(links.map((l) => l.supplier_id));
  const available = allSuppliers.filter((s) => !linkedSupplierIds.has(s.id));

  return (
    <div className="rounded-2xl border bg-gray-50 p-4 space-y-3">
      <div className="font-medium">Trusted suppliers</div>

      {loading ? (
        <div className="text-sm text-gray-600">Loading suppliers…</div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row gap-2">
            <select
              className="border rounded-lg px-3 py-2 bg-white"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
            >
              <option value="">Select supplier to add…</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.business_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={addLink}
              disabled={busy || !selectedSupplierId}
              className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          {links.length === 0 ? (
            <div className="text-sm text-gray-600">No suppliers linked yet.</div>
          ) : (
            <div className="space-y-2">
              {links.map((l) => (
                <div key={l.id} className="flex flex-col md:flex-row md:items-center gap-2 border rounded-xl bg-white p-3">
                  <div className="flex-1">
                    <div className="font-medium">{l.suppliers?.business_name ?? "Supplier"}</div>
                    <div className="text-xs text-gray-500">Supplier ID: {l.supplier_id}</div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!l.is_trusted}
                      onChange={(e) => updateLink(l.id, { is_trusted: e.target.checked })}
                      disabled={busy}
                    />
                    Trusted
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Order</span>
                    <input
                      className="w-20 border rounded-lg px-2 py-1"
                      type="number"
                      value={l.display_order ?? ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value;
                        updateLink(l.id, { display_order: v === "" ? null : Number(v) });
                      }}
                      disabled={busy}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLink(l.id)}
                    disabled={busy}
                    className="border rounded-lg px-3 py-2 bg-white"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
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
        setErr("That slug is already in use. Try adding the town or a number (e.g. '-lancaster' or '-2').");
      } else setErr(error.message);
    } else {
      setOk("Saved.");
      await onSaved?.();
    }

    setSaving(false);
  }

  if (loading) return <div className="p-6">Loading venue…</div>;

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={onBack} className="text-sm underline text-gray-700">← Back to venues</button>
            <h1 className="text-2xl font-semibold mt-2">Edit venue</h1>
          </div>
          <button onClick={onBack} className="border rounded-lg px-3 py-2 bg-white">Close</button>
        </div>

        <div className="rounded-2xl border bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm">Slug *</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={form.slug}
                onChange={(e) => setField("slug", e.target.value)}
                onBlur={() => setField("slug", slugify(form.slug || form.name))}
              />
              <p className="text-xs text-gray-500">Used in the URL. Auto-cleans on blur.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm">City</label>
              <input className="w-full border rounded-lg px-3 py-2" value={form.city} onChange={(e) => setField("city", e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm">Postcode</label>
              <input className="w-full border rounded-lg px-3 py-2" value={form.postcode} onChange={(e) => setField("postcode", e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm">Website URL</label>
              <input className="w-full border rounded-lg px-3 py-2" value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm">Description</label>
              <textarea className="w-full border rounded-lg px-3 py-2 min-h-[140px]" value={form.description} onChange={(e) => setField("description", e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input id="published" type="checkbox" checked={form.is_published} onChange={(e) => setField("is_published", e.target.checked)} />
            <label htmlFor="published" className="text-sm">Published</label>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}
          {ok && <div className="text-sm text-green-700">{ok}</div>}

          {/* Trusted suppliers */}
          <VenueSupplierLinks venueId={venueId} user={user} />

          <button onClick={save} disabled={saving} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
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
      <form onSubmit={createVenue} className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="font-medium">Add venue</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="border rounded-lg px-3 py-2" placeholder="Venue name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="border rounded-lg px-3 py-2" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <input className="border rounded-lg px-3 py-2" placeholder="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={saving} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
          {saving ? "Saving…" : "Create venue"}
        </button>
      </form>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b font-medium">Venue list</div>
        {loading ? (
          <div className="p-5">Loading…</div>
        ) : venues.length === 0 ? (
          <div className="p-5 text-gray-600">No venues yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-5 py-2">Name</th>
                <th className="text-left px-5 py-2">Slug</th>
                <th className="text-left px-5 py-2">City</th>
                <th className="text-left px-5 py-2">Postcode</th>
                <th className="text-left px-5 py-2">Published</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedVenueId(v.id)} title="Click to edit">
                  <td className="px-5 py-2 font-medium">{v.name}</td>
                  <td className="px-5 py-2 text-gray-600">{v.slug}</td>
                  <td className="px-5 py-2">{v.city || "—"}</td>
                  <td className="px-5 py-2">{v.postcode || "—"}</td>
                  <td className="px-5 py-2">{v.is_published ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
