import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { slugify } from "../../utils/slugify";

function SupplierVenueLinksReadOnly({ supplierId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("venue_suppliers")
        .select("id,is_trusted,display_order,venues(id,name,slug)")
        .eq("supplier_id", supplierId)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error) setErr(error.message);
      else setRows(data || []);

      setLoading(false);
    })();
  }, [supplierId]);

  return (
    <div className="rounded-2xl border bg-gray-50 p-4 space-y-2">
      <div className="font-medium">Trusted by venues</div>

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : err ? (
        <div className="text-sm text-red-600">{err}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-600">Not linked to any venues yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl bg-white border p-3">
              <div>
                <div className="font-medium">{r.venues?.name ?? "Venue"}</div>
                <div className="text-xs text-gray-500">{r.venues?.slug ?? ""}</div>
              </div>
              <div className="text-sm text-gray-700 flex items-center gap-4">
                <span>Trusted: {r.is_trusted ? "Yes" : "No"}</span>
                <span>Order: {r.display_order ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierBookings({ supplierId, user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // form
  const [eventDate, setEventDate] = useState("");
  const [eventPostcode, setEventPostcode] = useState("");
  const [source, setSource] = useState("whatsapp");
  const [status, setStatus] = useState("tentative");
  const [valueGbp, setValueGbp] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase
      .from("off_platform_bookings")
      .select("id,event_date,event_postcode,source,status,value_gbp,customer_name,created_at")
      .eq("supplier_id", supplierId)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  async function createBooking(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!eventDate) return setErr("Event date is required.");

    setSaving(true);

    const payload = {
      supplier_id: supplierId,
      event_date: eventDate,
      event_postcode: eventPostcode.trim() || null,
      source,
      status,
      value_gbp: valueGbp === "" ? null : Number(valueGbp),
      customer_name: customerName.trim() || null,
      customer_email: customerEmail.trim() || null,
      customer_phone: customerPhone.trim() || null,
      notes: notes.trim() || null,
      created_by_user_id: user.id,
    };

    const { error } = await supabase.from("off_platform_bookings").insert(payload);

    if (error) {
      setErr(error.message);
    } else {
      setOk("Booking logged.");
      setEventDate("");
      setEventPostcode("");
      setSource("whatsapp");
      setStatus("tentative");
      setValueGbp("");
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setNotes("");
      await load();
    }

    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Off-platform bookings</div>
            <div className="text-sm text-gray-600">
              Log WhatsApp/phone/Instagram/website bookings so Eventwow is useful even without leads.
            </div>
          </div>
        </div>

        <form onSubmit={createBooking} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Event date *</div>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 w-full"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-1">Postcode</div>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                placeholder="LA6 1..."
                value={eventPostcode}
                onChange={(e) => setEventPostcode(e.target.value)}
              />
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-1">Source</div>
              <select
                className="border rounded-lg px-3 py-2 w-full bg-white"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="website">Website</option>
                <option value="email">Email</option>
                <option value="walkup">Walk-up</option>
                <option value="referral">Referral</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-1">Status</div>
              <select
                className="border rounded-lg px-3 py-2 w-full bg-white"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="tentative">Tentative</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Value £</div>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                placeholder="e.g. 950"
                value={valueGbp}
                onChange={(e) => setValueGbp(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-sm text-gray-600 mb-1">Notes</div>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                placeholder="Optional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Customer name</div>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Customer email</div>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Customer phone</div>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}
          {ok && <div className="text-sm text-green-700">{ok}</div>}

          <button
            disabled={saving}
            className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Log booking"}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b font-medium">Recent bookings</div>

        {loading ? (
          <div className="p-5 text-gray-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-gray-600">No bookings logged yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-5 py-2">Date</th>
                <th className="text-left px-5 py-2">Status</th>
                <th className="text-left px-5 py-2">Source</th>
                <th className="text-left px-5 py-2">Postcode</th>
                <th className="text-left px-5 py-2">Customer</th>
                <th className="text-left px-5 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-5 py-2">{r.event_date}</td>
                  <td className="px-5 py-2">{r.status}</td>
                  <td className="px-5 py-2">{r.source}</td>
                  <td className="px-5 py-2">{r.event_postcode ?? "—"}</td>
                  <td className="px-5 py-2">{r.customer_name ?? "—"}</td>
                  <td className="px-5 py-2">{r.value_gbp == null ? "—" : `£${Number(r.value_gbp).toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SupplierEdit({ supplierId, user, onBack, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [form, setForm] = useState({
    business_name: "",
    slug: "",
    base_city: "",
    base_postcode: "",
    description: "",
    website_url: "",
    instagram_url: "",
    public_email: "",
    public_phone: "",
    is_published: true,
    is_verified: false,
    credits_balance: 0,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      setOk("");

      const { data, error } = await supabase
        .from("suppliers")
        .select(
          "id,business_name,slug,base_city,base_postcode,description,website_url,instagram_url,public_email,public_phone,is_published,is_verified,credits_balance"
        )
        .eq("id", supplierId)
        .maybeSingle();

      if (error) setErr(error.message);
      else if (!data) setErr("Supplier not found.");
      else {
        setForm({
          business_name: data.business_name ?? "",
          slug: data.slug ?? "",
          base_city: data.base_city ?? "",
          base_postcode: data.base_postcode ?? "",
          description: data.description ?? "",
          website_url: data.website_url ?? "",
          instagram_url: data.instagram_url ?? "",
          public_email: data.public_email ?? "",
          public_phone: data.public_phone ?? "",
          is_published: !!data.is_published,
          is_verified: !!data.is_verified,
          credits_balance: Number(data.credits_balance ?? 0),
        });
      }

      setLoading(false);
    })();
  }, [supplierId]);

  function setField(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setErr("");
    setOk("");

    const business_name = form.business_name.trim();
    const slug = slugify(form.slug || form.business_name);

    if (!business_name) {
      setErr("Business name is required.");
      setSaving(false);
      return;
    }
    if (!slug) {
      setErr("Slug is required.");
      setSaving(false);
      return;
    }

    const payload = {
      business_name,
      slug,
      base_city: form.base_city.trim() || null,
      base_postcode: form.base_postcode.trim() || null,
      description: form.description.trim() || null,
      website_url: form.website_url.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      public_email: form.public_email.trim() || null,
      public_phone: form.public_phone.trim() || null,
      is_published: !!form.is_published,
      is_verified: !!form.is_verified,
      updated_by_user_id: user.id,
    };

    const { error } = await supabase.from("suppliers").update(payload).eq("id", supplierId);

    if (error) {
      if (String(error.message || "").toLowerCase().includes("suppliers_slug_key")) {
        setErr("That slug is already in use. Try adding the town or a number (e.g. '-lancaster' or '-2').");
      } else setErr(error.message);
    } else {
      setOk("Saved.");
      await onSaved?.();
    }

    setSaving(false);
  }

  if (loading) return <div className="p-5">Loading supplier…</div>;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm underline text-gray-700">← Back to suppliers</button>

      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Edit supplier</h2>
            <p className="text-sm text-gray-600">Fill in the profile properly for seed data + SEO later.</p>
          </div>
          <button onClick={onBack} className="border rounded-lg px-3 py-2 bg-white">Close</button>
        </div>
<div className="rounded-xl border bg-gray-50 p-3 text-sm">
  <span className="font-medium">Credits remaining:</span>{" "}
  {form.credits_balance}
</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm">Business name *</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm">Slug *</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.slug}
              onChange={(e) => setField("slug", e.target.value)}
              onBlur={() => setField("slug", slugify(form.slug || form.business_name))}
            />
            <p className="text-xs text-gray-500">Auto-cleans on blur.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm">Base city</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.base_city} onChange={(e) => setField("base_city", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm">Base postcode</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.base_postcode} onChange={(e) => setField("base_postcode", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm">Public email</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.public_email} onChange={(e) => setField("public_email", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm">Public phone</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.public_phone} onChange={(e) => setField("public_phone", e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm">Website URL</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm">Instagram URL</label>
            <input className="w-full border rounded-lg px-3 py-2" value={form.instagram_url} onChange={(e) => setField("instagram_url", e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm">Description</label>
            <textarea className="w-full border rounded-lg px-3 py-2 min-h-[140px]" value={form.description} onChange={(e) => setField("description", e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_published} onChange={(e) => setField("is_published", e.target.checked)} />
            Published
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_verified} onChange={(e) => setField("is_verified", e.target.checked)} />
            Verified
          </label>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        {ok && <div className="text-sm text-green-700">{ok}</div>}

        <button onClick={save} disabled={saving} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
      <SupplierVenueLinksReadOnly supplierId={supplierId} />
      <SupplierBookings supplierId={supplierId} user={user} />

    </div>
  );
}

export default function SupplierList({ user }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [baseCity, setBaseCity] = useState("");
  const [basePostcode, setBasePostcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [createLoginNow, setCreateLoginNow] = useState(true);

  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  async function loadSuppliers() {
    setErr("");
    setLoading(true);
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,business_name,slug,base_city,base_postcode,is_published,is_verified,created_at")
      .order("created_at", { ascending: false });

    if (error) setErr(error.message);
    else setSuppliers(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function createSupplier(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setSaving(true);

    const slug = slugify(businessName);
    if (!businessName || !slug) {
      setErr("Business name is required.");
      setSaving(false);
      return;
    }

    // If creating login, go through the server endpoint so we can create an auth user (requires service role).
    if (createLoginNow) {
      const email = loginEmail.trim().toLowerCase();
      if (!email) {
        setErr("Login email is required when creating supplier login.");
        setSaving(false);
        return;
      }

      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes?.session?.access_token;
      if (!token) {
        setErr("You must be logged in as admin to do that.");
        setSaving(false);
        return;
      }

      try {
        const resp = await fetch("/api/admin-create-supplier", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            business_name: businessName,
            slug,
            base_city: baseCity || null,
            base_postcode: basePostcode || null,
            public_email: email,
            created_by_user_id: user.id,
          }),
        });

        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(json?.error || "Failed to create supplier.");
        }

        setBusinessName("");
        setLoginEmail("");
        setBaseCity("");
        setBasePostcode("");
        setOk("Supplier + login created. Supplier can sign in via magic link using their email.");
        await loadSuppliers();
      } catch (e2) {
        setErr(e2.message || "Failed to create supplier.");
      }

      setSaving(false);
      return;
    }

    const { error } = await supabase.from("suppliers").insert({
      business_name: businessName,
      slug,
      base_city: baseCity || null,
      base_postcode: basePostcode || null,
      created_by_user_id: user.id,
      updated_by_user_id: user.id,
      is_published: true,
      is_verified: false,
      country_code: "GB",
    });

    if (error) setErr(error.message);
    else {
      setBusinessName("");
      setBaseCity("");
      setBasePostcode("");
      await loadSuppliers();
    }

    setSaving(false);
  }

  if (selectedSupplierId) {
    return (
      <SupplierEdit
        supplierId={selectedSupplierId}
        user={user}
        onBack={() => setSelectedSupplierId(null)}
        onSaved={loadSuppliers}
      />
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createSupplier} className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="font-medium">Add supplier</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded-lg px-3 py-2" placeholder="Business name *" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Login email (magic link)"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
          <input className="border rounded-lg px-3 py-2" placeholder="Base city" value={baseCity} onChange={(e) => setBaseCity(e.target.value)} />
          <input className="border rounded-lg px-3 py-2" placeholder="Base postcode" value={basePostcode} onChange={(e) => setBasePostcode(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={createLoginNow} onChange={(e) => setCreateLoginNow(e.target.checked)} />
          Create supplier login now (recommended)
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}
        {ok && <div className="text-sm text-green-700">{ok}</div>}
        <button disabled={saving} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
          {saving ? "Saving…" : createLoginNow ? "Create supplier + login" : "Create supplier"}
        </button>
        <p className="text-xs text-gray-500">
          Tip: if you tick “Create supplier login now”, the supplier can sign in immediately via magic link. Click a supplier row below to edit it.
        </p>
      </form>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b font-medium">Supplier list</div>
        {loading ? (
          <div className="p-5">Loading…</div>
        ) : suppliers.length === 0 ? (
          <div className="p-5 text-gray-600">No suppliers yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-5 py-2">Business</th>
                <th className="text-left px-5 py-2">Slug</th>
                <th className="text-left px-5 py-2">City</th>
                <th className="text-left px-5 py-2">Postcode</th>
                <th className="text-left px-5 py-2">Published</th>
                <th className="text-left px-5 py-2">Verified</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedSupplierId(s.id)}
                  title="Click to edit"
                >
                  <td className="px-5 py-2 font-medium">{s.business_name}</td>
                  <td className="px-5 py-2 text-gray-600">{s.slug}</td>
                  <td className="px-5 py-2">{s.base_city || "—"}</td>
                  <td className="px-5 py-2">{s.base_postcode || "—"}</td>
                  <td className="px-5 py-2">{s.is_published ? "Yes" : "No"}</td>
                  <td className="px-5 py-2">{s.is_verified ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
