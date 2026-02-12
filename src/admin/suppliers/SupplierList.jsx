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
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

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

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (err) return <p className="text-sm text-rose-600">{err}</p>;

  if (!rows.length) {
    return <EmptyState title="No linked venues" description="This supplier has not been trusted by any venues yet." />;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm">
            <p className="font-medium text-slate-900">{r.venues?.name || "Unknown venue"}</p>
            <p className="text-xs text-slate-500">{r.venues?.slug || "-"}</p>
          </div>
          <Badge variant={r.is_trusted ? "success" : "neutral"}>{r.is_trusted ? "Trusted" : "Not trusted"}</Badge>
        </div>
      ))}
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

  const [txns, setTxns] = useState([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnsErr, setTxnsErr] = useState("");

  const [creditChange, setCreditChange] = useState(0);
  const [creditReason, setCreditReason] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditMsg, setCreditMsg] = useState("");
  const [showAdjustModal, setShowAdjustModal] = useState(false);

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
        loadCreditTransactions();
      }

      setLoading(false);
    })();
  }, [supplierId]);

  function setField(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function loadCreditTransactions() {
    setTxnsLoading(true);
    setTxnsErr("");
    try {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id,change,reason,related_quote_id,created_by_user_id,created_by_name,created_at")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTxns(data || []);
    } catch (e) {
      setTxnsErr(e?.message || "Failed to load credit transactions");
    } finally {
      setTxnsLoading(false);
    }
  }

  async function adjustCredits(changeAmount) {
    setCreditSubmitting(true);
    setErr("");
    setOk("");
    setCreditMsg("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/admin-adjust-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          supplier_id: supplierId,
          change: changeAmount,
          reason: creditReason,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.details || json?.error || "Failed to adjust credits");
      }

      setForm((p) => ({ ...p, credits_balance: json.credits_balance }));
      setCreditChange(0);
      setCreditReason("");
      setCreditMsg(`Credits updated. New balance: ${json.credits_balance}`);
      setShowAdjustModal(false);
      await loadCreditTransactions();
    } catch (e) {
      setErr(e?.message || "Failed to adjust credits");
    } finally {
      setCreditSubmitting(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr("");
    setOk("");

    if (!form.business_name?.trim()) {
      setErr("Business name is required.");
      setSaving(false);
      return;
    }
    if (!form.slug?.trim()) {
      setErr("Slug is required.");
      setSaving(false);
      return;
    }

    const payload = {
      business_name: form.business_name.trim(),
      slug: form.slug.trim(),
      base_city: form.base_city?.trim() || null,
      base_postcode: form.base_postcode?.trim() || null,
      description: form.description?.trim() || null,
      website_url: form.website_url?.trim() || null,
      instagram_url: form.instagram_url?.trim() || null,
      public_email: form.public_email?.trim() || null,
      public_phone: form.public_phone?.trim() || null,
      is_published: !!form.is_published,
      is_verified: !!form.is_verified,
      updated_by_user_id: user?.id || null,
    };

    const { error } = await supabase.from("suppliers").update(payload).eq("id", supplierId);

    if (error) setErr(error.message);
    else {
      setOk("Saved.");
      onSaved?.();
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier detail"
        subtitle="Update profile settings and manage credits."
        actions={[
          { key: "back", label: "Back", variant: "secondary", onClick: onBack },
          { key: "save", label: saving ? "Saving..." : "Save", onClick: save, disabled: saving },
        ]}
      />

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Credits balance" value={form.credits_balance ?? 0} hint="Current available credits" />
        <StatCard label="Published" value={form.is_published ? "Yes" : "No"} />
        <StatCard label="Verified" value={form.is_verified ? "Yes" : "No"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credits management</CardTitle>
          <CardDescription>Adjust supplier credits with audited changes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {creditMsg ? <p className="text-sm text-emerald-700">{creditMsg}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setShowAdjustModal(true)}>Adjust credits</Button>
            <Button type="button" variant="secondary" onClick={loadCreditTransactions} disabled={txnsLoading}>
              {txnsLoading ? "Refreshing..." : "Refresh history"}
            </Button>
          </div>

          {txnsErr ? <p className="text-sm text-rose-600">{txnsErr}</p> : null}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Change</TH>
                  <TH>Reason</TH>
                  <TH>By</TH>
                  <TH>Quote</TH>
                </TR>
              </THead>
              <TBody>
                {(txns || []).slice(0, 50).map((t) => (
                  <TR key={t.id}>
                    <TD className="whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleString() : ""}</TD>
                    <TD className="font-medium text-slate-900">{t.change > 0 ? `+${t.change}` : t.change}</TD>
                    <TD>{t.reason}</TD>
                    <TD className="text-slate-600">
                      {t.created_by_name
                        ? t.created_by_name
                        : t.created_by_user_id
                        ? `${String(t.created_by_user_id).slice(0, 8)}...`
                        : "-"}
                    </TD>
                    <TD className="text-slate-600">
                      {t.related_quote_id ? `${String(t.related_quote_id).slice(0, 8)}...` : "-"}
                    </TD>
                  </TR>
                ))}
                {!txnsLoading && (!txns || txns.length === 0) ? (
                  <TR>
                    <TD colSpan={5} className="text-slate-600">No credit transactions yet.</TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Public supplier details and visibility flags.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Business name *</label>
            <Input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Slug *</label>
            <div className="flex gap-2">
              <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} />
              <Button type="button" variant="secondary" onClick={() => setField("slug", slugify(form.business_name))}>Auto</Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Base city</label>
            <Input value={form.base_city} onChange={(e) => setField("base_city", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Base postcode</label>
            <Input value={form.base_postcode} onChange={(e) => setField("base_postcode", e.target.value)} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Website URL</label>
            <Input value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Instagram URL</label>
            <Input value={form.instagram_url} onChange={(e) => setField("instagram_url", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Public email</label>
            <Input value={form.public_email} onChange={(e) => setField("public_email", e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Public phone</label>
            <Input value={form.public_phone} onChange={(e) => setField("public_phone", e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="is_published"
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setField("is_published", e.target.checked)}
            />
            Published
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id="is_verified"
              type="checkbox"
              checked={form.is_verified}
              onChange={(e) => setField("is_verified", e.target.checked)}
            />
            Verified
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trusted by venues</CardTitle>
          <CardDescription>Read-only trust links from venue mappings.</CardDescription>
        </CardHeader>
        <CardContent>
          <SupplierVenueLinksReadOnly supplierId={supplierId} />
        </CardContent>
      </Card>

      <Modal
        open={showAdjustModal}
        title="Confirm credit adjustment"
        onClose={() => setShowAdjustModal(false)}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setShowAdjustModal(false)} disabled={creditSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => adjustCredits(creditChange)}
              disabled={creditSubmitting || !creditReason.trim() || !Number.isInteger(creditChange) || creditChange === 0}
            >
              {creditSubmitting ? "Applying..." : "Confirm"}
            </Button>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Change (integer)</label>
            <Input type="number" step="1" value={creditChange} onChange={(e) => setCreditChange(parseInt(e.target.value || "0", 10))} />
            <div className="flex flex-wrap gap-2">
              {[5, 10, 25].map((n) => (
                <Button key={n} type="button" variant="secondary" size="sm" disabled={creditSubmitting} onClick={() => setCreditChange(n)}>
                  +{n}
                </Button>
              ))}
              <Button type="button" variant="secondary" size="sm" disabled={creditSubmitting} onClick={() => setCreditChange(-5)}>
                -5
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Reason *</label>
            <Input
              placeholder="e.g. Pilot top-up / manual correction"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SupplierList({ user }) {
  const [suppliers, setSuppliers] = useState([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("suppliers")
        .select("id,business_name,slug,base_city,base_postcode,is_published,is_verified,credits_balance")
        .order("created_at", { ascending: false });

      if (error) setErr(error.message);
      else {
        setSuppliers(data || []);
        setFilteredSuppliers(data || []);
      }

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFilteredSuppliers(suppliers);
      return;
    }

    setFilteredSuppliers(
      suppliers.filter((s) =>
        [s.business_name, s.slug, s.base_city, s.base_postcode].join(" ").toLowerCase().includes(q)
      )
    );
  }, [search, suppliers]);

  function refresh() {
    (async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,business_name,slug,base_city,base_postcode,is_published,is_verified,credits_balance")
        .order("created_at", { ascending: false });

      if (!error) {
        setSuppliers(data || []);
      }
    })();
  }

  if (selectedSupplierId) {
    return (
      <SupplierEdit
        supplierId={selectedSupplierId}
        user={user}
        onBack={() => setSelectedSupplierId(null)}
        onSaved={refresh}
      />
    );
  }

  const positiveCredits = suppliers.filter((s) => Number(s.credits_balance || 0) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" subtitle="Manage supplier profiles and credits." />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="Total suppliers" value={suppliers.length} />
        <StatCard label="With credits" value={positiveCredits} />
        <StatCard label="Published" value={suppliers.filter((s) => s.is_published).length} />
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers by name, slug, city, or postcode"
              className="sm:max-w-md"
            />
            <Button type="button" variant="secondary" onClick={refresh}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      <Card className="overflow-hidden">
        {loading ? (
          <CardContent className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        ) : filteredSuppliers.length === 0 ? (
          <CardContent>
            <EmptyState title="No suppliers found" description="Try a different search term." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Business</TH>
                  <TH>Slug</TH>
                  <TH>Base</TH>
                  <TH>Credits</TH>
                  <TH>Published</TH>
                  <TH>Verified</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {filteredSuppliers.map((s) => (
                  <TR key={s.id} interactive>
                    <TD className="font-medium text-slate-900">{s.business_name}</TD>
                    <TD className="text-slate-600">{s.slug}</TD>
                    <TD className="text-slate-600">
                      {(s.base_city || "") + (s.base_postcode ? ` (${s.base_postcode})` : "") || "-"}
                    </TD>
                    <TD>
                      <Badge variant={Number(s.credits_balance || 0) > 0 ? "brand" : "neutral"}>
                        {s.credits_balance ?? 0}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge variant={s.is_published ? "success" : "neutral"}>{s.is_published ? "Yes" : "No"}</Badge>
                    </TD>
                    <TD>
                      <Badge variant={s.is_verified ? "success" : "warning"}>{s.is_verified ? "Yes" : "No"}</Badge>
                    </TD>
                    <TD className="text-right">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedSupplierId(s.id)}>
                        View
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
