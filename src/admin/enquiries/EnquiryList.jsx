import { FormField, Textarea, Select, Feedback, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, Skeleton } from "../../components/workspace/AdminPrimitives";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import { MetricCard, DataTable, FilterBar, StatusBadge } from "../../components/workspace/WorkspaceComponents";
import { Inbox, Send, Clock } from "lucide-react";

async function fetchAdminJson(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const resp = await fetch(path, { ...options, headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function adminCatchAll(path) {
  return `/api/admin/[...path]?path=${encodeURIComponent(path)}`;
}

function statusVariant(status) {
  if (status === "accepted") return "success";
  if (status === "declined") return "danger";
  if (status === "quoted" || status === "responded") return "brand";
  if (status === "viewed") return "warning";
  return "neutral";
}

function EnquiryCreate({ user, onDone }) {
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custPref, setCustPref] = useState("email");

  const [eventDate, setEventDate] = useState("");
  const [eventPostcode, setEventPostcode] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [notes, setNotes] = useState("");

  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState("");

  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: s }] = await Promise.all([
        supabase.from("venues").select("id,name").order("name", { ascending: true }),
        supabase.from("suppliers").select("id,business_name").eq("is_published", true).order("business_name", { ascending: true }),
      ]);
      setVenues(v || []);
      setSuppliers(s || []);
    })();
  }, []);

  function toggleSupplier(id) {
    setSelectedSupplierIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createEnquiryFlow(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!custName.trim()) return setErr("Customer name is required.");
    if (!custEmail.trim()) return setErr("Customer email is required.");
    if (!custPhone.trim()) return setErr("Customer phone is required.");

    if (!eventDate) return setErr("Event date is required.");
    if (!eventPostcode.trim()) return setErr("Event postcode is required.");

    if (selectedSupplierIds.length === 0) return setErr("Select at least 1 supplier to invite.");

    setSaving(true);

    try {
      let customerId = null;

      const { data: existingCustomer, error: findErr } = await supabase
        .from("customers")
        .select("id")
        .eq("email", custEmail.trim())
        .maybeSingle();

      if (findErr) throw findErr;

      if (existingCustomer?.id) {
        customerId = existingCustomer.id;
      } else {
        const { data: createdCustomer, error: cErr } = await supabase
          .from("customers")
          .insert({
            full_name: custName.trim(),
            email: custEmail.trim(),
            phone: custPhone.trim(),
            preferred_contact_method: custPref,
            created_by_user_id: user.id,
          })
          .select("id")
          .single();

        if (cErr) throw cErr;
        customerId = createdCustomer.id;
      }

      const { data: enquiry, error: eErr } = await supabase
        .from("enquiries")
        .insert({
          customer_id: customerId,
          venue_id: venueId || null,
          match_source: venueId ? "venue_referral" : "concierge",
          status: "new",
          event_date: eventDate,
          event_postcode: eventPostcode.trim(),
          guest_count: guestCount === "" ? null : Number(guestCount),
          budget_min_gbp: budgetMin === "" ? null : Number(budgetMin),
          budget_max_gbp: budgetMax === "" ? null : Number(budgetMax),
          notes: notes.trim() || null,
          created_by_user_id: user.id,
          updated_by_user_id: user.id,
        })
        .select("id")
        .single();

      if (eErr) throw eErr;

      const rows = selectedSupplierIds.map((sid) => ({
        enquiry_id: enquiry.id,
        supplier_id: sid,
        supplier_status: "invited",
        match_source: venueId ? "venue_referral" : "concierge",
        created_by_user_id: user.id,
      }));

      const { error: linkErr } = await supabase.from("enquiry_suppliers").insert(rows);
      if (linkErr) throw linkErr;

      setOk(`Enquiry created and ${selectedSupplierIds.length} supplier(s) invited.`);
      await onDone?.();
      setSelectedSupplierIds([]);
      setEventDate("");
      setEventPostcode("");
      setGuestCount("");
      setBudgetMin("");
      setBudgetMax("");
      setNotes("");
    } catch (ex) {
      setErr(ex?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ew-page-stack">
      <PageHeader title="Create enquiry" subtitle="Customer to enquiry to supplier invites." />

      <form onSubmit={createEnquiryFlow} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Customer details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormField label="Full name *"><Input placeholder="Full name *" value={custName} onChange={(e) => setCustName(e.target.value)} /></FormField>
              <FormField label="Email *"><Input placeholder="Email *" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} /></FormField>
              <FormField label="Phone *"><Input placeholder="Phone *" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} /></FormField>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FormField label="Preferred contact"><Select
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2"
                value={custPref}
                onChange={(e) => setCustPref(e.target.value)}
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
              </Select></FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormField label="Event date"><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></FormField>
              <FormField label="Event postcode *"><Input placeholder="Event postcode *" value={eventPostcode} onChange={(e) => setEventPostcode(e.target.value)} /></FormField>
              <FormField label="Guests (optional)"><Input placeholder="Guests (optional)" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} /></FormField>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormField label="Budget min GBP"><Input placeholder="Budget min GBP" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} /></FormField>
              <FormField label="Budget max GBP"><Input placeholder="Budget max GBP" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} /></FormField>
              <FormField label="Venue attribution"><Select
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="">No venue attribution</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select></FormField>
            </div>

            <FormField label="Notes (optional)"><Textarea
              className="min-h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2"
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            /></FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite suppliers</CardTitle>
            <CardDescription>Select one or more suppliers for this enquiry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid max-h-96 grid-cols-1 gap-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
              {suppliers.map((s) => {
                const checked = selectedSupplierIds.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input type="checkbox" checked={checked} onChange={() => toggleSupplier(s.id)} />
                    <span className="font-medium text-slate-900">{s.business_name}</span>
                  </label>
                );
              })}
            </div>
            <span className="ew-result-count">Selected: {selectedSupplierIds.length}</span>
          </CardContent>
        </Card>

        {err ? <Feedback tone="danger">{err}</Feedback> : null}
        {ok ? <Feedback tone="success">{ok}</Feedback> : null}

        <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create enquiry + invite suppliers"}</Button>
      </form>
    </div>
  );
}

function InviteRow({ invite, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(invite.declined_reason || "");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [showDecline, setShowDecline] = useState(invite.supplier_status === "declined");

  async function updateInvite(patch) {
    setBusy(true);
    setErr("");
    setOk("");

    const { error } = await supabase.from("enquiry_suppliers").update(patch).eq("id", invite.id);

    if (error) {
      setErr(error.message);
    } else {
      setOk("Saved.");
      setTimeout(() => setOk(""), 1500);
      onUpdated?.();
    }

    setBusy(false);
  }

  async function markViewed() {
    await updateInvite({
      supplier_status: "viewed",
      viewed_at: new Date().toISOString(),
      declined_reason: null,
    });
    setShowDecline(false);
  }

  async function markResponded() {
    await updateInvite({
      supplier_status: "responded",
      responded_at: new Date().toISOString(),
      declined_reason: null,
    });
    setShowDecline(false);
  }

  async function saveDecline() {
    await updateInvite({
      supplier_status: "declined",
      declined_reason: reason.trim() || null,
    });
    setShowDecline(false);
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">{invite.suppliers?.business_name ?? "Supplier"}</p>
            <Badge variant={statusVariant(invite.supplier_status)}>{invite.supplier_status}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={markViewed}>Mark viewed</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={markResponded}>Mark responded</Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setShowDecline(true)}>Decline</Button>
          </div>
        </div>

        {showDecline ? (
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <FormField label="Decline reason (optional)"><Input
              placeholder="Decline reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            /></FormField>
            <Button type="button" variant="secondary" disabled={busy} onClick={saveDecline}>Save decline</Button>
          </div>
        ) : null}

        {err ? <Feedback tone="danger">{err}</Feedback> : null}
        {ok ? <Feedback tone="success">{ok}</Feedback> : null}
      </CardContent>
    </Card>
  );
}

function QuotePanel({ enquiryId, supplierId, user }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);

  const [newTitle, setNewTitle] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState("");

  async function load() {
    setErr("");
    setOk("");
    setLoading(true);

    const { data: q, error: qErr } = await supabase
      .from("quotes")
      .select("id,status,total_amount,notes,created_at")
      .eq("enquiry_id", enquiryId)
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (qErr) {
      setErr(qErr.message);
      setLoading(false);
      return;
    }

    setQuote(q || null);

    if (q?.id) {
      const { data: it, error: iErr } = await supabase
        .from("quote_items")
        .select("id,title,qty,unit_price,line_total,sort_order")
        .eq("quote_id", q.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (iErr) setErr(iErr.message);
      setItems(it || []);
    } else {
      setItems([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [enquiryId, supplierId]);

  async function createDraft() {
    setErr("");
    setOk("");
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        enquiry_id: enquiryId,
        supplier_id: supplierId,
        status: "draft",
        currency_code: "GBP",
        total_amount: 0,
        created_by_user_id: user.id,
        updated_by_user_id: user.id,
      })
      .select("id,status,total_amount,notes,created_at")
      .single();

    if (error) {
      setErr(error.message);
    } else {
      setQuote(data);
      setItems([]);
      setOk("Draft created.");
    }
  }

  async function addItem() {
    if (!quote?.id) return;
    setErr("");
    setOk("");

    const title = newTitle.trim();
    const qty = newQty === "" ? 1 : Number(newQty);
    const unit = newUnit === "" ? 0 : Number(newUnit);

    if (!title) return setErr("Item title is required.");
    if (!Number.isFinite(qty) || qty <= 0) return setErr("Qty must be > 0.");
    if (!Number.isFinite(unit) || unit < 0) return setErr("Unit price must be >= 0.");

    const nextOrder = items.length ? Math.max(...items.map((x) => x.sort_order || 1)) + 1 : 1;

    const { error } = await supabase.from("quote_items").insert({
      quote_id: quote.id,
      title,
      qty,
      unit_price: unit,
      sort_order: nextOrder,
    });

    if (error) setErr(error.message);
    else {
      setNewTitle("");
      setNewQty("1");
      setNewUnit("");
      await load();
      setOk("Item added.");
    }
  }

  async function deleteItem(itemId) {
    if (!quote?.id) return;
    setErr("");
    setOk("");

    const { error } = await supabase.from("quote_items").delete().eq("id", itemId);
    if (error) setErr(error.message);
    else {
      await load();
      setOk("Item removed.");
    }
  }

  async function recalcTotal() {
    if (!quote?.id) return;
    setErr("");
    setOk("");

    const total = items.reduce((sum, x) => sum + Number(x.line_total || 0), 0);

    const { error } = await supabase
      .from("quotes")
      .update({
        total_amount: total,
        updated_by_user_id: user.id,
      })
      .eq("id", quote.id);

    if (error) setErr(error.message);
    else {
      await load();
      setOk("Total updated.");
    }
  }

  async function setQuoteStatus(nextStatus) {
    if (!quote?.id) return;
    setErr("");
    setOk("");

    const patch = {
      status: nextStatus,
      updated_by_user_id: user.id,
    };

    const now = new Date().toISOString();
    if (nextStatus === "sent") patch.sent_at = now;
    if (nextStatus === "accepted") patch.accepted_at = now;
    if (nextStatus === "declined") patch.declined_at = now;

    const { error } = await supabase.from("quotes").update(patch).eq("id", quote.id);

    if (error) setErr(error.message);
    else {
      let nextInviteStatus = null;
      if (nextStatus === "sent") nextInviteStatus = "quoted";
      if (nextStatus === "accepted") nextInviteStatus = "accepted";
      if (nextStatus === "declined") nextInviteStatus = "declined";

      if (nextInviteStatus) {
        await supabase
          .from("enquiry_suppliers")
          .update({
            supplier_status: nextInviteStatus,
            responded_at: nextInviteStatus === "quoted" ? { responded_at: new Date().toISOString() } : {},
          })
          .eq("enquiry_id", enquiryId)
          .eq("supplier_id", supplierId);
      }

      let nextEnquiryStatus = null;
      if (nextStatus === "sent") nextEnquiryStatus = "quoted";
      if (nextStatus === "accepted") nextEnquiryStatus = "accepted";

      if (nextEnquiryStatus) {
        await supabase
          .from("enquiries")
          .update({
            status: nextEnquiryStatus,
            updated_by_user_id: user.id,
          })
          .eq("id", enquiryId);
      }

      if (nextStatus === "sent") {
        const { data: supplier } = await supabase
          .from("suppliers")
          .select("credits_balance")
          .eq("id", supplierId)
          .maybeSingle();

        if (!supplier || supplier.credits_balance <= 0) {
          setErr("Supplier has no credits remaining.");
          return;
        }

        await supabase
          .from("suppliers")
          .update({
            credits_balance: supplier.credits_balance - 1,
          })
          .eq("id", supplierId);

        await supabase.from("credit_transactions").insert({
          supplier_id: supplierId,
          change: -1,
          reason: "Quote sent",
          related_quote_id: quote.id,
          created_by_user_id: user.id,
        });
      }

      await load();
      setOk(`Quote ${nextStatus}.`);
    }
  }

  if (loading) return <Skeleton className="h-24 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Quote</CardTitle>
          {!quote ? <Button type="button" size="sm" onClick={createDraft}>Create draft</Button> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!quote ? (
          <EmptyState title="No quote yet" description="Create a draft quote for this supplier." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">Status: {quote.status}</Badge>
              <span className="font-semibold">Total: GBP {Number(quote.total_amount || 0).toFixed(2)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setQuoteStatus("sent")}
                disabled={quote.status !== "draft"}
                title={quote.status !== "draft" ? "Only draft quotes can be sent" : ""}
              >
                Send
              </Button>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setQuoteStatus("accepted")}
                disabled={quote.status !== "sent"}
                title={quote.status !== "sent" ? "Only sent quotes can be accepted" : ""}
              >
                Accept
              </Button>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setQuoteStatus("declined")}
                disabled={quote.status !== "sent"}
                title={quote.status !== "sent" ? "Only sent quotes can be declined" : ""}
              >
                Decline
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              {items.length === 0 ? (
                <div className="p-3 text-sm text-slate-600">No items yet.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{it.title}</p>
                        <p className="text-xs text-slate-600">
                          {it.qty} x GBP {Number(it.unit_price).toFixed(2)} = GBP {Number(it.line_total).toFixed(2)}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="danger" onClick={() => deleteItem(it.id)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <FormField label="Item title" className="md:col-span-2"><Input
                className="md:col-span-2"
                placeholder="Item title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              /></FormField>
              <FormField label="Qty"><Input placeholder="Qty" value={newQty} onChange={(e) => setNewQty(e.target.value)} /></FormField>
              <FormField label="Unit GBP"><Input placeholder="Unit GBP" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} /></FormField>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={addItem}>Add item</Button>
              <Button type="button" size="sm" onClick={recalcTotal}>Recalculate total</Button>
            </div>
          </>
        )}

        {err ? <Feedback tone="danger">{err}</Feedback> : null}
        {ok ? <Feedback tone="success">{ok}</Feedback> : null}
      </CardContent>
    </Card>
  );
}

function EnquiryDetail({ enquiryId, user, onBack }) {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [enquiry, setEnquiry] = useState(null);
  const [invites, setInvites] = useState([]);

  async function load() {
    setErr("");
    if (enquiry === null) setLoading(true);

    try {
      const json = await fetchAdminJson(adminCatchAll(`enquiries/${enquiryId}`));
      setEnquiry(json?.enquiry || null);
      setInvites(Array.isArray(json?.invites) ? json.invites : []);
    } catch (ex) {
      setErr(ex?.message || "Failed to load enquiry");
      setEnquiry(null);
      setInvites([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [enquiryId]);

  if (loading || err || !enquiry) return <div className="ew-page-stack">
    <PageHeader title="Enquiry detail" actions={[{ key: "back", label: "Back to enquiries", variant: "secondary", onClick: onBack }]} />
    {loading ? <Skeleton className="h-40 w-full" /> : err ? <Feedback tone="danger" onRetry={load}>{err}</Feedback> : <EmptyState title="Enquiry not found" description="The selected enquiry could not be loaded." />}
  </div>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Enquiry detail"
        subtitle="Manage invited suppliers and quote actions."
        actions={[{ key: "back", label: "Back to enquiries", variant: "secondary", onClick: onBack }]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Overview</CardTitle>
            <Badge variant={statusVariant(enquiry.status)}>{enquiry.status}</Badge>
            <span className="ew-muted">{enquiry.match_source}</span>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
          <p><span className="ew-muted">Date:</span> {enquiry.event_date}</p>
          <p><span className="ew-muted">Postcode:</span> {enquiry.event_postcode}</p>
          <p><span className="ew-muted">Event type:</span> {enquiry.event_type || "-"}</p>
          <p><span className="ew-muted">Category:</span> {enquiry.enquiry_category_slug || "-"}</p>
          <p><span className="ew-muted">Start time:</span> {enquiry.start_time || "-"}</p>
          <p><span className="ew-muted">Guests:</span> {enquiry.guest_count ?? "-"}</p>
          <p><span className="ew-muted">Budget range:</span> {enquiry.budget_range || "-"}</p>
          <p>
            <span className="ew-muted">Budget amount:</span>{" "}
            {enquiry.budget_amount ? `£${Number(enquiry.budget_amount).toFixed(2)} ${enquiry.budget_unit === "per_person" ? "per person" : "in total"}` : "-"}
          </p>
          <p><span className="ew-muted">Venue:</span> {enquiry.venues?.name ?? "-"}</p>
          <p><span className="ew-muted">Venue known:</span> {enquiry.venue_known ? "Yes" : "No"}</p>
          <p><span className="ew-muted">Venue name:</span> {enquiry.venue_name || "-"}</p>
          <p><span className="ew-muted">Venue postcode:</span> {enquiry.venue_postcode || "-"}</p>
          <p><span className="ew-muted">Indoor/outdoor:</span> {enquiry.indoor_outdoor || "-"}</p>
          <p><span className="ew-muted">Power available:</span> {enquiry.power_available === null ? "-" : enquiry.power_available ? "Yes" : "No"}</p>
          <p><span className="ew-muted">Contact preference:</span> {enquiry.contact_preference || "-"}</p>
          <p><span className="ew-muted">Urgency:</span> {enquiry.urgency || "-"}</p>
          <p><span className="ew-muted">Source page:</span> {enquiry.source_page || "-"}</p>
          <p><span className="ew-muted">Message quality score:</span> {Number(enquiry.message_quality_score || 0)}</p>
          <p className="md:col-span-2"><span className="ew-muted">Quality flags:</span> {Array.isArray(enquiry.message_quality_flags) && enquiry.message_quality_flags.length > 0 ? enquiry.message_quality_flags.join(", ") : "-"}</p>
          {enquiry.dietary_requirements ? <p className="md:col-span-2 whitespace-pre-wrap"><span className="ew-muted">Dietary requirements:</span> {enquiry.dietary_requirements}</p> : null}
          {enquiry.message ? <p className="md:col-span-2 whitespace-pre-wrap"><span className="ew-muted">Message:</span> {enquiry.message}</p> : null}
          {enquiry.structured_answers ? (
            <p className="md:col-span-2 whitespace-pre-wrap">
              <span className="ew-muted">Structured answers:</span> {JSON.stringify(enquiry.structured_answers, null, 2)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-slate-700">
          <p>{enquiry.customers?.full_name}</p>
          <p className="text-slate-600">{enquiry.customers?.email}</p>
          <p className="text-slate-600">{enquiry.customers?.phone}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invited suppliers</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <EmptyState title="No suppliers attached" description="Invite suppliers to continue this enquiry." />
          ) : (
            <div className="space-y-3">
              {invites.map((x) => (
                <div key={x.id} className="space-y-3">
                  <InviteRow invite={x} onUpdated={load} />
                  <QuotePanel enquiryId={enquiryId} supplierId={x.supplier_id ?? x.supplier_id} user={user} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EnquiryList({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("list");
  const isDev = import.meta.env.DEV;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filteredRows = useMemo(() => rows.filter((row) =>
    (status === "all" || row.status === status) &&
    [row.customers?.full_name, row.event_postcode, row.venues?.name, row.event_type].join(" ").toLowerCase().includes(search.toLowerCase())
  ), [rows, search, status]);

  async function load() {
    setErr("");
    setLoading(true);
    const params = new URLSearchParams({ status: "all", page: "1", pageSize: "100" });
    params.set("path", "enquiries");
    const url = `/api/admin/[...path]?${params.toString()}`;

    try {
      const json = await fetchAdminJson(url);
      const nextRows = Array.isArray(json?.rows) ? json.rows : [];
      if (isDev) {
        console.debug("[admin/enquiries] load", {
          endpoint: url,
          params,
          rowcount: nextRows.length,
          request_id: json?.request_id || null,
        });
      }
      setRows(nextRows);
    } catch (ex) {
      const message = ex?.message || "Failed to load enquiries";
      if (isDev) {
        console.debug("[admin/enquiries] load-error", { endpoint: url, params, error: message });
      }
      setErr(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (mode === "detail" && selectedId) {
    return (
      <EnquiryDetail
        enquiryId={selectedId}
        user={user}
        onBack={() => {
          setSelectedId(null);
          setMode("list");
        }}
      />
    );
  }

  if (mode === "create") {
    return (
      <div className="space-y-4">
        <Button type="button" variant="secondary" onClick={() => {
          setSelectedId(null);
          setMode("list");
        }}>
          Back to enquiries
        </Button>

        <EnquiryCreate
          user={user}
          onDone={async () => {
            await load();
            setMode("list");
          }}
        />
      </div>
    );
  }

  return (
    <div className="ew-page-stack">
      <PageHeader title="Enquiries" subtitle="Review concierge enquiries and supplier activity." actions={[{ key: "create", label: "Create enquiry", onClick: () => setMode("create") }]} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard label="Loaded enquiries" value={err ? null : rows.length} hint="Latest 100 records" icon={Inbox} loading={loading} />
        <MetricCard label="New" value={err ? null : rows.filter((r) => r.status === "new").length} hint="Within loaded records" tone="orange" icon={Clock} loading={loading} />
        <MetricCard label="Quoted" value={err ? null : rows.filter((r) => r.status === "quoted").length} hint="Within loaded records" tone="green" icon={Send} loading={loading} />
      </div>
      <div className="ew-panel">
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Search customer, postcode or venue…" status={status} onStatusChange={setStatus} statuses={[...new Set(rows.map((row) => row.status).filter(Boolean))].map((value) => ({ value, label: value }))} count={loading || err ? null : filteredRows.length}>
          <Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
        </FilterBar>
        <DataTable caption="Admin enquiries, latest 100 records" rows={filteredRows} loading={loading} error={err} onRetry={load} emptyTitle={rows.length ? "No matching enquiries" : "No enquiries yet"} emptyDescription={rows.length ? "Try a different search or status." : "Create a concierge enquiry to get started."} columns={[
          { key: "customer", label: "Customer", render: (row) => <button className="ew-text-action" onClick={() => { setSelectedId(row.id); setMode("detail"); }}>{row.customers?.full_name || "View enquiry"}</button> },
          { key: "event_date", label: "Event date" }, { key: "event_postcode", label: "Postcode" },
          { key: "venue", label: "Venue", render: (row) => row.venues?.name || "—" },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> }, { key: "match_source", label: "Source" },
        ]} />
      </div>
    </div>
  );
}
