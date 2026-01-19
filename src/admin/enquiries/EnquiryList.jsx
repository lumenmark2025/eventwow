import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

function EnquiryCreate({ user, onDone }) {
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Customer (quality gate)
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custPref, setCustPref] = useState("email");

  // Enquiry
  const [eventDate, setEventDate] = useState("");
  const [eventPostcode, setEventPostcode] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [notes, setNotes] = useState("");

  // Optional venue attribution
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState("");

  // Suppliers to invite
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
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function createEnquiryFlow(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    // Validate customer gate
    if (!custName.trim()) return setErr("Customer name is required.");
    if (!custEmail.trim()) return setErr("Customer email is required.");
    if (!custPhone.trim()) return setErr("Customer phone is required.");

    // Validate enquiry basics
    if (!eventDate) return setErr("Event date is required.");
    if (!eventPostcode.trim()) return setErr("Event postcode is required.");

    // Validate supplier invites (lead gen signal)
    if (selectedSupplierIds.length === 0) return setErr("Select at least 1 supplier to invite.");

    setSaving(true);

    try {
      // 1) Create or fetch customer by email (email is unique)
      let customerId = null;

      const { data: existingCustomer, error: findErr } = await supabase
        .from("customers")
        .select("id")
        .eq("email", custEmail.trim())
        .maybeSingle();

      if (findErr) throw findErr;

      if (existingCustomer?.id) {
        customerId = existingCustomer.id;
        // Optional: you can update phone/name here if you want later.
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

      // 2) Create enquiry
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

      // 3) Attach suppliers (invites)
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
      // Clear form lightly (keep suppliers loaded)
      setSelectedSupplierIds([]);
      setEventDate("");
      setEventPostcode("");
      setGuestCount("");
      setBudgetMin("");
      setBudgetMax("");
      setNotes("");
      // keep customer details to allow multiple enquiries in a row if needed
    } catch (ex) {
      setErr(ex?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Create enquiry (concierge)</h2>
        <p className="text-sm text-gray-600">Customer → enquiry → invite suppliers. No junk leads.</p>
      </div>

      <form onSubmit={createEnquiryFlow} className="rounded-2xl border bg-white p-5 space-y-6">
        {/* Customer */}
        <div className="space-y-3">
          <div className="font-medium">Customer (required)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Full name *" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <input className="border rounded-lg px-3 py-2" placeholder="Email *" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} />
            <input className="border rounded-lg px-3 py-2" placeholder="Phone *" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">Preferred contact:</span>
            <select className="border rounded-lg px-3 py-2 bg-white" value={custPref} onChange={(e) => setCustPref(e.target.value)}>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
        </div>

        {/* Enquiry */}
        <div className="space-y-3">
          <div className="font-medium">Event details (required)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="date" className="border rounded-lg px-3 py-2" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <input className="border rounded-lg px-3 py-2" placeholder="Event postcode *" value={eventPostcode} onChange={(e) => setEventPostcode(e.target.value)} />
            <input className="border rounded-lg px-3 py-2" placeholder="Guests (optional)" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="border rounded-lg px-3 py-2" placeholder="Budget min £ (optional)" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
            <input className="border rounded-lg px-3 py-2" placeholder="Budget max £ (optional)" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            <select className="border rounded-lg px-3 py-2 bg-white" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              <option value="">No venue attribution</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <textarea className="border rounded-lg px-3 py-2 w-full min-h-[120px]" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Supplier invites */}
        <div className="space-y-3">
          <div className="font-medium">Invite suppliers (required)</div>
          <div className="text-sm text-gray-600">
            Select 1–5 suppliers. This is your “lead generation signal” early on.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[260px] overflow-auto border rounded-xl p-3 bg-gray-50">
            {suppliers.map((s) => {
              const checked = selectedSupplierIds.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm bg-white border rounded-lg px-3 py-2">
                  <input type="checkbox" checked={checked} onChange={() => toggleSupplier(s.id)} />
                  <span className="font-medium">{s.business_name}</span>
                </label>
              );
            })}
          </div>

          <div className="text-sm text-gray-600">Selected: {selectedSupplierIds.length}</div>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
        {ok && <div className="text-sm text-green-700">{ok}</div>}

        <button disabled={saving} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50">
          {saving ? "Creating…" : "Create enquiry + invite suppliers"}
        </button>
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
      // optional timestamp if you add this column later
      // declined_at: new Date().toISOString(),
    });
    setShowDecline(false);
  }

  return (
    <div className="border rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{invite.suppliers?.business_name ?? "Supplier"}</div>
          <div className="text-xs text-gray-500">
            Status: <span className="font-medium">{invite.supplier_status}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="border rounded-lg px-3 py-1.5 bg-white text-sm"
            onClick={markViewed}
          >
            Mark viewed
          </button>

          <button
            type="button"
            disabled={busy}
            className="border rounded-lg px-3 py-1.5 bg-white text-sm"
            onClick={markResponded}
          >
            Mark responded
          </button>

          <button
            type="button"
            disabled={busy}
            className="border rounded-lg px-3 py-1.5 bg-white text-sm"
            onClick={() => setShowDecline(true)}
          >
            Decline
          </button>
        </div>
      </div>

      {showDecline && (
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <input
            className="border rounded-lg px-3 py-2 text-sm w-full"
            placeholder="Decline reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy}
            className="border rounded-lg px-3 py-2 bg-white text-sm"
            onClick={saveDecline}
          >
            Save decline
          </button>
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}
      {ok && <div className="text-sm text-green-700">{ok}</div>}
    </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // likely hit the unique partial index for draft
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
  
  // 1 Update Quote
  
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
    // Sync enquiry_suppliers status (keeps the enquiry timeline coherent)
// 2 Sync enquiry_suppliers status    
let nextInviteStatus = null;
if (nextStatus === "sent") nextInviteStatus = "quoted";
if (nextStatus === "accepted") nextInviteStatus = "accepted";
if (nextStatus === "declined") nextInviteStatus = "declined";

if (nextInviteStatus) {
  await supabase
    .from("enquiry_suppliers")
    .update({
      supplier_status: nextInviteStatus,
      responded_at: (nextInviteStatus === "quoted" ? { responded_at: new Date().toISOString() } : {}),
    })
    .eq("enquiry_id", enquiryId)
    .eq("supplier_id", supplierId);
}
// Keep parent enquiry status in sync (simple v1 rule)
// 3 Sync enquiries status
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
// 4 Deduct 1 credit when a quote is SENT
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

  // Deduct credit
  await supabase
    .from("suppliers")
    .update({
      credits_balance: supplier.credits_balance - 1,
    })
    .eq("id", supplierId);

  // Log transaction
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

  if (loading) return <div className="text-sm text-gray-600">Loading quote…</div>;

  return (
    <div className="rounded-2xl border bg-gray-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">Quote</div>
        {!quote && (
          <button
            type="button"
            onClick={createDraft}
            className="rounded-lg bg-black text-white px-3 py-2 text-sm"
          >
            Create draft
          </button>
        )}
      </div>

      {!quote ? (
        <div className="text-sm text-gray-600">No quote yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2 py-1 rounded-full bg-white border">status: {quote.status}</span>
            <span className="px-2 py-1 rounded-full bg-white border">total: £{Number(quote.total_amount || 0).toFixed(2)}</span>
          </div>
<div className="flex flex-wrap gap-2">
  <button
    type="button"
    className="rounded-lg bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
    onClick={() => setQuoteStatus("sent")}
    disabled={quote.status !== "draft"}
    title={quote.status !== "draft" ? "Only draft quotes can be sent" : ""}
  >
    Send
  </button>

  <button
    type="button"
    className="border rounded-lg px-3 py-2 bg-white text-sm disabled:opacity-50"
    onClick={() => setQuoteStatus("accepted")}
    disabled={quote.status !== "sent"}
    title={quote.status !== "sent" ? "Only sent quotes can be accepted" : ""}
  >
    Accept
  </button>

  <button
    type="button"
    className="border rounded-lg px-3 py-2 bg-white text-sm disabled:opacity-50"
    onClick={() => setQuoteStatus("declined")}
    disabled={quote.status !== "sent"}
    title={quote.status !== "sent" ? "Only sent quotes can be declined" : ""}
  >
    Decline
  </button>
</div>

          <div className="rounded-xl bg-white border overflow-hidden">
            <div className="px-3 py-2 border-b text-sm font-medium">Line items</div>
            {items.length === 0 ? (
              <div className="p-3 text-sm text-gray-600">No items yet.</div>
            ) : (
              <div className="divide-y">
                {items.map((it) => (
                  <div key={it.id} className="p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">{it.title}</div>
                      <div className="text-xs text-gray-600">
                        {it.qty} × £{Number(it.unit_price).toFixed(2)} = £{Number(it.line_total).toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="border rounded-lg px-3 py-2 bg-white text-sm"
                      onClick={() => deleteItem(it.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
              placeholder="Item title (e.g. Pizza catering for 80 guests)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Qty"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Unit £"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addItem}
              className="border rounded-lg px-3 py-2 bg-white text-sm"
            >
              Add item
            </button>
            <button
              type="button"
              onClick={recalcTotal}
              className="rounded-lg bg-black text-white px-3 py-2 text-sm"
            >
              Recalculate total
            </button>
          </div>
        </div>
      )}

      {err && <div className="text-sm text-red-600">{err}</div>}
      {ok && <div className="text-sm text-green-700">{ok}</div>}
    </div>
  );
}

function EnquiryDetail({ enquiryId, user, onBack }) {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [enquiry, setEnquiry] = useState(null);
  const [invites, setInvites] = useState([]);

  async function load() {
  setErr("");
   // Only show the big loading screen the first time.
  // On refresh (after a status update), keep the UI visible.
  if (enquiry === null) setLoading(true);

  const [{ data: e, error: eErr }, { data: i, error: iErr }] = await Promise.all([
    supabase
      .from("enquiries")
      .select("id,event_date,event_postcode,guest_count,status,match_source,notes,created_at,customers(full_name,email,phone),venues(name)")
      .eq("id", enquiryId)
      .maybeSingle(),
    supabase
      .from("enquiry_suppliers")
      .select("id,supplier_id,supplier_status,invited_at,viewed_at,responded_at,declined_reason,suppliers(business_name)")
      .eq("enquiry_id", enquiryId)
      .order("invited_at", { ascending: true }),
  ]);

  if (eErr) setErr(eErr.message);
  if (iErr) setErr(iErr.message);

  setEnquiry(e || null);
  setInvites(i || []);
  setLoading(false);
}

useEffect(() => {
  load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [enquiryId]);

  if (loading) return <div className="p-5">Loading enquiry…</div>;
  if (err) return <div className="p-5 text-red-600">Error: {err}</div>;
  if (!enquiry) return <div className="p-5">Enquiry not found.</div>;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm underline text-gray-700">← Back to enquiries</button>

      <div className="rounded-2xl border bg-white p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Enquiry</h2>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">status: {enquiry.status}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">source: {enquiry.match_source}</span>
        </div>

        <div className="text-sm text-gray-700">
          <div><span className="text-gray-500">Date:</span> {enquiry.event_date}</div>
          <div><span className="text-gray-500">Postcode:</span> {enquiry.event_postcode}</div>
          <div><span className="text-gray-500">Guests:</span> {enquiry.guest_count ?? "—"}</div>
          <div><span className="text-gray-500">Venue:</span> {enquiry.venues?.name ?? "—"}</div>
        </div>

        {enquiry.notes && (
          <div className="text-sm text-gray-700">
            <div className="text-gray-500">Notes:</div>
            <div className="whitespace-pre-wrap">{enquiry.notes}</div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-2">
        <div className="font-medium">Customer</div>
        <div className="text-sm text-gray-700">
          <div>{enquiry.customers?.full_name}</div>
          <div className="text-gray-600">{enquiry.customers?.email}</div>
          <div className="text-gray-600">{enquiry.customers?.phone}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="font-medium">Invited suppliers</div>
        {invites.length === 0 ? (
          <div className="text-sm text-gray-600">No suppliers attached.</div>
        ) : (
          <div className="space-y-2">
{invites.map((x) => (
  <div key={x.id} className="space-y-2">
    <InviteRow invite={x} onUpdated={load} />
    <QuotePanel enquiryId={enquiryId} supplierId={x.supplier_id ?? x.supplier_id} user={user} />
  </div>
))}

</div>

        )}
      </div>
    </div>
  );
}

export default function EnquiryList({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("list"); // "list" | "create" | "detail"


  async function load() {
    setErr("");
    setLoading(true);

    // Pull enquiries plus customer + venue names
    const { data, error } = await supabase
      .from("enquiries")
      .select("id,event_date,event_postcode,status,match_source,created_at,customers(full_name),venues(name)")
      .order("created_at", { ascending: false });

    if (error) setErr(error.message);
    else setRows(data || []);

    setLoading(false);
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
      <button
        onClick={() => {
          setSelectedId(null);
          setMode("list");
        }}
        className="text-sm underline text-gray-700"
      >
        ← Back to enquiries
      </button>

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
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Enquiries</h2>
          <p className="text-sm text-gray-600">Click an enquiry to view invited suppliers.</p>
        </div>

        <button
  className="rounded-lg bg-black text-white px-4 py-2"
  onClick={() => setMode("create")}
>
  Create enquiry
</button>

      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b font-medium">List</div>
        {loading ? (
          <div className="p-5">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-gray-600">No enquiries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-5 py-2">Date</th>
                <th className="text-left px-5 py-2">Postcode</th>
                <th className="text-left px-5 py-2">Customer</th>
                <th className="text-left px-5 py-2">Venue</th>
                <th className="text-left px-5 py-2">Status</th>
                <th className="text-left px-5 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedId(r.id);
                    setMode("detail");
                  }}
                  title="Click to view"
                >
                  <td className="px-5 py-2">{r.event_date}</td>
                  <td className="px-5 py-2">{r.event_postcode}</td>
                  <td className="px-5 py-2">{r.customers?.full_name ?? "—"}</td>
                  <td className="px-5 py-2">{r.venues?.name ?? "—"}</td>
                  <td className="px-5 py-2">{r.status}</td>
                  <td className="px-5 py-2">{r.match_source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Next chunk: add a proper <b>Create Enquiry</b> button that opens the EnquiryCreate form (modal or page), and then returns here after save.
      </div>
    </div>
  );
}

