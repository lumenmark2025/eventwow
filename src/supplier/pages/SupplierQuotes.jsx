import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Skeleton from "../../components/ui/Skeleton";

function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function money(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0.00";
  return v.toFixed(2);
}

function moneyMinor(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0.00";
  return (v / 100).toFixed(2);
}

function calcLineTotal(qty, unit) {
  const q = Number(qty);
  const u = Number(unit);
  const total = (Number.isFinite(q) ? q : 0) * (Number.isFinite(u) ? u : 0);
  return Number.isFinite(total) ? total : 0;
}

export default function SupplierQuotes({ supplierId }) {
  if (!supplierId) {
    return (
      <div className="p-4 rounded-lg border bg-white">
        <p className="text-sm text-red-600">
          SupplierQuotes error: missing supplierId (cannot load quotes)
        </p>
      </div>
    );
  }

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selectedQuoteId, setSelectedQuoteId] = useState(null);

  const [supplierCredits, setSupplierCredits] = useState(null);

  // Quote editor state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteErr, setQuoteErr] = useState("");
  const [quoteOk, setQuoteOk] = useState("");
  const [publicQuoteUrl, setPublicQuoteUrl] = useState("");

  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [payment, setPayment] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [depositAmountInput, setDepositAmountInput] = useState("100");

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

  // NEW: dirty flag (unsaved changes)
  const [isDirty, setIsDirty] = useState(false);

  // If an enquiry creates a quote then switches tab,
  // we stash the quote id in window.__OPEN_QUOTE_ID__
  const pendingOpenIdRef = useRef(null);
  const didCheckWindowRef = useRef(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const openIdFromUrl = searchParams.get("open");

  const computedTotal = useMemo(() => {
    return (items || []).reduce((sum, it) => sum + calcLineTotal(it.qty, it.unit_price), 0);
  }, [items]);

  function patchQuoteRow(nextQuoteLike) {
    if (!nextQuoteLike?.id) return;
    setRows((prev) =>
      (prev || []).map((row) => {
        if (row.id !== nextQuoteLike.id) return row;
        return {
          ...row,
          ...nextQuoteLike,
          total_amount:
            nextQuoteLike.total_amount !== undefined
              ? nextQuoteLike.total_amount
              : row.total_amount,
        };
      })
    );
  }

  async function loadCredits() {
    if (!supplierId) return;

    try {
      const { data: authRes, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw authErr;
      const token = authRes?.session?.access_token;
      if (!token) return;

      const resp = await fetch("/api/supplier-credits", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return;

      if (json?.ok) {
        setSupplierCredits(Number(json.credits_balance ?? 0));
      }
    } catch {
      // ignore credits fetch errors to avoid blocking UI
    }
  }

  async function loadList() {
    if (!supplierId) return;

    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("quotes")
      .select(
        "id,status,total_amount,currency_code,enquiry_id,created_at,sent_at,accepted_at,declined_at,closed_at,enquiries(event_date,event_postcode,venues(name))"
      )
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  }

  // ✅ Load quotes list + credits on mount (and if supplierId changes)
  useEffect(() => {
    // reset any selected quote when supplier changes
    setSelectedQuoteId(null);
    setQuote(null);
    setItems([]);
    setQuoteErr("");
    setQuoteOk("");
    setPublicQuoteUrl("");
    setIsDirty(false);
    setPayment(null);
    setDepositAmountInput("100");

    loadCredits();
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  // 1) If URL has ?open=<id>, stash it for auto-open once list loads.
  useEffect(() => {
    if (!openIdFromUrl) return;

    pendingOpenIdRef.current = openIdFromUrl;

    // Optional: clean the URL so refresh doesn't keep forcing open
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("open");
        return next;
      },
      { replace: true }
    );
  }, [openIdFromUrl, setSearchParams]);

  async function openQuote(quoteId) {
    setSelectedQuoteId(quoteId);
    setQuote(null);
    setItems([]);
    setQuoteErr("");
    setQuoteOk("");
    setIsDirty(false);
    setPayment(null);
    setDepositAmountInput("100");

    if (!quoteId) return;

    setQuoteLoading(true);
    try {
      // Load quote (ensure supplier owns it via RLS)
      const { data: q, error: qErr } = await supabase
        .from("quotes")
        .select("id,status,total_amount,currency_code,enquiry_id,message,notes,created_at,sent_at,accepted_at,declined_at,closed_at")
        .eq("id", quoteId)
        .maybeSingle();

      if (qErr) throw qErr;
      if (!q) throw new Error("Quote not found.");

      // Load items
      const { data: its, error: itErr } = await supabase
        .from("quote_items")
        .select("id,quote_id,title,qty,unit_price,sort_order,created_at")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (itErr) throw itErr;

      setQuote(q);
      setPublicQuoteUrl("");
      setItems(
        (its || []).map((it) => ({
          ...it,
          qty: Number(it.qty ?? 1),
          unit_price: Number(it.unit_price ?? 0),
        }))
      );

      setIsDirty(false);
      const quoteStatus = String(q?.status || "").toLowerCase();
      if (quoteStatus && quoteStatus !== "draft") {
        await fetchPublicLinkForQuote(q.id, { copyToClipboard: false, silent: true });
      }
      await loadCredits();
    } catch (e) {
      setQuoteErr(e?.message || "Failed to load quote.");
    } finally {
      setQuoteLoading(false);
    }
  }

  // 1) On first mount of this component, grab window.__OPEN_QUOTE_ID__ if set.
  useEffect(() => {
    if (didCheckWindowRef.current) return;
    didCheckWindowRef.current = true;

    const id = window.__OPEN_QUOTE_ID__;
    if (id) {
      pendingOpenIdRef.current = id;
      window.__OPEN_QUOTE_ID__ = null;
    }
  }, []);

  // 2) Once the list is loaded (or refreshed), auto-open the pending id (if present).
  useEffect(() => {
    const id = pendingOpenIdRef.current;
    if (!id) return;
    if (loading) return;

    // If it's in the list, open it; if not, still try to open (RLS will enforce)
    openQuote(id);
    pendingOpenIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows]);

  useEffect(() => {
    const currentStatus = String(quote?.status || "").toLowerCase();
    if (!quote?.id || !["accepted", "sent", "closed", "declined"].includes(currentStatus)) {
      setPayment(null);
      return;
    }

    const token = getQuoteTokenFromPublicUrl(publicQuoteUrl);
    if (!token) return;
    loadPaymentStatusForToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id, quote?.status, publicQuoteUrl]);

  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    setIsDirty(true);
    setSaveStatus("idle");
    setQuoteOk("");
    setQuoteErr("");
  }

  function addItem() {
    const tempId = `temp_${Math.random().toString(16).slice(2)}`;
    const nextSort =
      (items?.length ? Math.max(...items.map((i) => Number(i.sort_order || 1))) : 0) + 1;

    setItems((prev) => [
      ...(prev || []),
      {
        id: tempId,
        quote_id: quote?.id,
        title: "New item",
        qty: 1,
        unit_price: 0,
        sort_order: nextSort,
        _isTemp: true,
      },
    ]);
    setIsDirty(true);
    setSaveStatus("idle");
    setQuoteOk("");
    setQuoteErr("");
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setIsDirty(true);
    setSaveStatus("idle");
    setQuoteOk("");
    setQuoteErr("");
  }

  function moveItem(id, direction) {
    setItems((prev) => {
      const list = [...(prev || [])];
      const index = list.findIndex((it) => it.id === id);
      if (index < 0) return list;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return list;

      const a = list[index];
      const b = list[targetIndex];
      const aOrder = Number(a.sort_order);
      const bOrder = Number(b.sort_order);

      const nextA = { ...a, sort_order: Number.isFinite(bOrder) ? bOrder : targetIndex + 1 };
      const nextB = { ...b, sort_order: Number.isFinite(aOrder) ? aOrder : index + 1 };

      list[index] = nextB;
      list[targetIndex] = nextA;
      return list;
    });
    setIsDirty(true);
    setSaveStatus("idle");
    setQuoteOk("");
    setQuoteErr("");
  }

  const hasItemValidationError = useMemo(() => {
    return (items || []).some((it) => {
      const titleOk = String(it.title || "").trim().length > 0;
      const qty = Number(it.qty);
      const price = Number(it.unit_price);
      const qtyOk = Number.isFinite(qty) && qty >= 1;
      const priceOk = Number.isFinite(price) && price >= 0;
      return !titleOk || !qtyOk || !priceOk;
    });
  }, [items]);

  // ✅ FIXED: delete-before-insert, and compute totals from DB after reload
  async function saveDraft() {
    if (!quote?.id) return;
    if (saving) return;
    const status = String(quote.status).toLowerCase();
    if (status !== "draft") {
      if (["accepted", "declined", "closed"].includes(status)) {
        setQuoteErr("Quote is locked.");
        setSaveStatus("error");
        return;
      }
      setQuoteErr("Only draft quotes can be edited.");
      setSaveStatus("error");
      return;
    }

    if (hasItemValidationError) {
      setQuoteErr("Fix item fields before saving.");
      setSaveStatus("error");
      return;
    }

    setSaving(true);
    setQuoteErr("");
    setQuoteOk("");
    setSaveStatus("saving");

    try {
      const { data: authRes, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw authErr;
      const token = authRes?.session?.access_token;
      if (!token) throw new Error("Not signed in.");

      // Send current UI items (temp + existing) to server; server replaces all items
      const payloadItems = (items || []).map((it, idx) => {
        const isTemp = typeof it.id === "string" && it.id.startsWith("temp_");

        return {
          id: isTemp ? null : it.id ?? null,
          title: String(it.title || "").trim() || "Item",
          qty: Number.isFinite(Number(it.qty)) ? Number(it.qty) : 1,
          unit_price: Number.isFinite(Number(it.unit_price)) ? Number(it.unit_price) : 0,
          sort_order: Number.isFinite(Number(it.sort_order)) ? Number(it.sort_order) : idx + 1,
        };
      });

      const res = await fetch("/api/supplier-save-draft-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quote_id: quote.id,
          items: payloadItems,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save draft.");
      }

      // DB truth back into state
      if (json.quote) {
        setQuote(json.quote);
        patchQuoteRow({
          ...json.quote,
          total_amount: json.total ?? json.quote.total_amount,
        });
      } else if (json.total !== undefined && quote?.id) {
        setQuote((prev) => ({ ...(prev || {}), total_amount: json.total }));
        patchQuoteRow({ id: quote.id, total_amount: json.total });
      }

      const freshItems = (json.items || []).map((it) => ({
        ...it,
        qty: Number(it.qty ?? 1),
        unit_price: Number(it.unit_price ?? 0),
      }));

      setItems(freshItems);
      setIsDirty(false);
      setQuoteOk("Draft saved.");
      setSaveStatus("saved");

      setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);

    } catch (e) {
      setQuoteErr((e?.message || e?.details || e?.hint || "Failed to save draft.").toString());
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function sendQuote() {
    if (!quote?.id) return;
    const status = String(quote.status).toLowerCase();
    if (status !== "draft") {
      if (["accepted", "declined", "closed"].includes(status)) {
        setQuoteErr("Quote is locked.");
        setSaveStatus("error");
        return;
      }
      setQuoteErr("Only draft quotes can be sent.");
      setSaveStatus("error");
      return;
    }

    setSending(true);
    setQuoteErr("");
    setQuoteOk("");
    setPublicQuoteUrl("");
    setSaveStatus("idle");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-send-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quote_id: quote.id }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg =
          [json?.error, json?.details].filter(Boolean).join(": ") || "Failed to send quote";
        throw new Error(msg);
      }

      if (json?.quote) {
        setQuote(json.quote);
        patchQuoteRow(json.quote);
      }
      if (Number.isFinite(Number(json?.credits_balance))) {
        setSupplierCredits(Number(json.credits_balance));
      }
      setQuoteOk("Quote sent.");
      setIsDirty(false);
      setSaveStatus("idle");
      await loadList();
    } catch (e) {
      setQuoteErr(e?.message || "Failed to send quote.");
      setSaveStatus("error");
    } finally {
      setSending(false);
    }
  }

  async function copyCustomerLink() {
    if (!quote?.id || linkBusy) return;
    await fetchPublicLinkForQuote(quote.id, { copyToClipboard: true, silent: false });
  }

  async function openMessages() {
    if (!quote?.id) return;

    setQuoteErr("");
    setQuoteOk("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-get-thread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quoteId: quote.id }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          [json?.error, json?.details].filter(Boolean).join(": ") || "Failed to open thread"
        );
      }

      const threadId = String(json?.threadId || "").trim();
      if (!threadId) throw new Error("No threadId returned");
      window.location.assign(`/supplier/messages?thread=${encodeURIComponent(threadId)}`);
    } catch (e) {
      setQuoteErr(e?.message || "Failed to open messages.");
    }
  }

  async function fetchPublicLinkForQuote(quoteId, options = {}) {
    const copyToClipboard = !!options.copyToClipboard;
    const silent = !!options.silent;
    if (!quoteId) return;

    setLinkBusy(true);
    if (!silent) {
      setQuoteErr("");
      setQuoteOk("");
    }

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-get-public-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quote_id: quoteId }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          [json?.error, json?.details].filter(Boolean).join(": ") || "Failed to create link"
        );
      }

      const nextUrl = String(json?.url || json?.path || "").trim();
      if (!nextUrl) throw new Error("No public link returned");

      const absoluteUrl = nextUrl.startsWith("http")
        ? nextUrl
        : `${window.location.origin}${nextUrl}`;

      setPublicQuoteUrl(absoluteUrl);
      if (copyToClipboard && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
      }
      if (!silent) {
        setQuoteOk(copyToClipboard ? "Customer link copied." : "Customer link ready.");
      }
    } catch (e) {
      if (!silent) {
        setQuoteErr(e?.message || "Failed to copy customer link.");
      }
    } finally {
      setLinkBusy(false);
    }
  }

  function getQuoteTokenFromPublicUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const idx = segments.findIndex((s) => s === "quote");
      if (idx >= 0 && segments[idx + 1]) return segments[idx + 1];
    } catch {
      const segments = String(url).split("/").filter(Boolean);
      const idx = segments.findIndex((s) => s === "quote");
      if (idx >= 0 && segments[idx + 1]) return segments[idx + 1];
    }
    return "";
  }

  async function loadPaymentStatusForToken(token) {
    if (!token) {
      setPayment(null);
      return;
    }

    setPaymentLoading(true);
    try {
      const resp = await fetch(`/api/public-payment-status?token=${encodeURIComponent(token)}`);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load payment status");
      setPayment(json?.payment || null);
    } catch {
      setPayment(null);
    } finally {
      setPaymentLoading(false);
    }
  }

  async function requestDeposit() {
    if (!quote?.id || paymentSaving) return;
    if (String(quote?.status || "").toLowerCase() !== "accepted") return;

    const pounds = Number(depositAmountInput);
    const amountTotal = Number.isFinite(pounds) ? Math.round(pounds * 100) : NaN;
    if (!Number.isInteger(amountTotal) || amountTotal < 1000 || amountTotal > 500000) {
      setQuoteErr("Deposit must be between £10 and £5,000.");
      return;
    }

    setPaymentSaving(true);
    setQuoteErr("");
    setQuoteOk("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-create-deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          quoteId: quote.id,
          amountTotal,
          currency: String(quote?.currency_code || "gbp").toLowerCase(),
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error([json?.error, json?.details].filter(Boolean).join(": ") || "Failed to request deposit");
      }

      if (json?.payment) {
        setPayment(json.payment);
      }
      setQuoteOk("Deposit requested. Share the customer quote link for payment.");

      const quoteToken = getQuoteTokenFromPublicUrl(publicQuoteUrl);
      if (quoteToken) {
        await loadPaymentStatusForToken(quoteToken);
      }
    } catch (e) {
      setQuoteErr(e?.message || "Failed to request deposit.");
    } finally {
      setPaymentSaving(false);
    }
  }

  async function closeQuote() {
    if (!quote?.id || closing) return;
    const confirmed = window.confirm("Close this quote? Customers won't be able to accept it.");
    if (!confirmed) return;

    setClosing(true);
    setQuoteErr("");
    setQuoteOk("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-close-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quote_id: quote.id }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409) {
          await openQuote(quote.id);
        }
        throw new Error(
          [json?.error, json?.details].filter(Boolean).join(": ") || "Failed to close quote"
        );
      }

      if (json?.quote) {
        setQuote(json.quote);
        patchQuoteRow(json.quote);
        await fetchPublicLinkForQuote(json.quote.id, { copyToClipboard: false, silent: true });
      }
      setQuoteOk("Quote closed.");
      await loadList();
    } catch (e) {
      setQuoteErr(e?.message || "Failed to close quote.");
    } finally {
      setClosing(false);
    }
  }

  async function reopenQuote() {
    if (!quote?.id || reopening) return;

    setReopening(true);
    setQuoteErr("");
    setQuoteOk("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-reopen-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ quote_id: quote.id }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409) {
          await openQuote(quote.id);
        }
        throw new Error(
          [json?.error, json?.details].filter(Boolean).join(": ") || "Failed to reopen quote"
        );
      }

      if (json?.quote) {
        setQuote(json.quote);
        patchQuoteRow(json.quote);
      }
      setQuoteOk("Quote reopened.");
      await loadList();
    } catch (e) {
      setQuoteErr(e?.message || "Failed to reopen quote.");
    } finally {
      setReopening(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      </div>
    );
  }
  if (err) return <div className="text-sm text-red-600">{err}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        subtitle="Build clean quotes, send confidently, and manage close/reopen states."
        actions={[{ key: "refresh", label: "Refresh", variant: "secondary", size: "sm", onClick: loadList }]}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* List */}
      <div className="rounded-2xl border bg-white p-4 sm:p-5 space-y-3">
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Quotes</h2>
            <div className="text-xs text-gray-600">
              Credits:{" "}
              <span className="font-medium">
                {supplierCredits === null ? "—" : supplierCredits}
              </span>{" "}
              (1 credit per quote sent)
            </div>
          </div>
          <button onClick={loadList} className="w-full sm:w-auto border rounded-lg px-4 py-2.5 bg-white text-sm">
            Refresh
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-gray-600">No quotes yet.</div>
        ) : (
          <div className="space-y-2 max-h-[560px] overflow-auto">
            {rows.map((q) => {
              const isActive = selectedQuoteId === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => openQuote(q.id)}
                  className={
                    "w-full text-left rounded-xl border p-4 hover:bg-gray-50 " +
                    (isActive ? "border-black" : "")
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium">
                      {q.enquiries?.venues?.name || "No venue"} · {q.enquiries?.event_date || "—"}
                    </div>
                    <div className="text-sm">status: {q.status}</div>
                  </div>

                  <div className="text-sm text-gray-600">
                    {q.enquiries?.event_postcode || ""}
                    {q.total_amount !== null && q.total_amount !== undefined
                      ? ` · total: £${money(q.total_amount)}`
                      : ""}
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    Created: {fmtDateTime(q.created_at)}
                    {q.sent_at ? ` · Sent: ${fmtDateTime(q.sent_at)}` : ""}
                    {q.accepted_at ? ` · Accepted: ${fmtDateTime(q.accepted_at)}` : ""}
                    {q.declined_at ? ` · Declined: ${fmtDateTime(q.declined_at)}` : ""}
                    {q.closed_at ? ` · Closed: ${fmtDateTime(q.closed_at)}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="text-xs text-gray-500">
          Draft quotes can be edited here. Sending a quote uses 1 credit and locks it.
        </div>
      </div>

      {/* Detail / editor */}
      <div className="rounded-2xl border bg-white p-4 sm:p-5">
        {!selectedQuoteId ? (
          <div className="text-sm text-gray-600">Select a quote to view and edit.</div>
        ) : quoteLoading ? (
          <div className="text-sm text-gray-600">Loading quote…</div>
        ) : !quote ? (
          <div className="space-y-2">
            {quoteErr ? <div className="text-sm text-red-600">{quoteErr}</div> : null}
            <div className="text-sm text-gray-600">Quote not found.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {String(quote?.status || "").toLowerCase() === "accepted" ? (
              <div className="text-sm rounded-lg border border-green-200 bg-green-50 text-green-800 p-3">
                Accepted on {fmtDateTime(quote?.accepted_at)}. This quote is locked.
              </div>
            ) : null}
            {String(quote?.status || "").toLowerCase() === "declined" ? (
              <div className="text-sm rounded-lg border border-red-200 bg-red-50 text-red-800 p-3">
                Declined on {fmtDateTime(quote?.declined_at)}. This quote is locked.
              </div>
            ) : null}
            {String(quote?.status || "").toLowerCase() === "closed" ? (
              <div className="text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-800 p-3">
                Closed on {fmtDateTime(quote?.closed_at)}. Customer actions are disabled.
              </div>
            ) : null}

            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
              <div>
                <div className="text-sm text-gray-600">Quote</div>
                <div className="text-lg font-semibold">{quote.id.slice(0, 8)}…</div>
                <div className="text-xs text-gray-500">
                  Status: <span className="font-medium">{quote.status}</span> · Created:{" "}
                  {fmtDateTime(quote.created_at)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Total</div>
                <div className="text-2xl font-semibold">
                  £{money(isDirty ? computedTotal : (quote?.total_amount ?? computedTotal))}
                </div>
              </div>
            </div>

            {quoteOk ? <div className="text-sm text-green-700">{quoteOk}</div> : null}
            {quoteErr ? <div className="text-sm text-red-600">{quoteErr}</div> : null}
            {publicQuoteUrl ? (
              <div className="text-sm">
                Customer link:{" "}
                <a className="text-blue-700 underline break-all" href={publicQuoteUrl} target="_blank" rel="noreferrer">
                  {publicQuoteUrl}
                </a>
              </div>
            ) : null}

            {String(quote?.status || "").toLowerCase() === "accepted" ? (
              <div className="rounded-xl border bg-gray-50 p-3 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">Deposit</div>
                  {paymentLoading ? (
                    <span className="text-xs text-gray-500">Loading...</span>
                  ) : payment ? (
                    <span className="text-xs rounded-full border px-2.5 py-1 bg-white">
                      {String(payment.status || "requires_payment")}
                    </span>
                  ) : (
                    <span className="text-xs rounded-full border px-2.5 py-1 bg-white">Not requested</span>
                  )}
                </div>

                {payment ? (
                  <div className="text-sm text-gray-700 space-y-1">
                    <div>Amount: £{moneyMinor(payment.amount_total)}</div>
                    <div>Paid: £{moneyMinor(payment.amount_paid)}</div>
                    {payment.paid_at ? <div>Paid at: {fmtDateTime(payment.paid_at)}</div> : null}
                  </div>
                ) : null}

                {!payment || ["failed", "canceled"].includes(String(payment?.status || "").toLowerCase()) ? (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600">Request a deposit from £10 to £5,000.</div>
                    <div className="flex flex-wrap gap-2">
                      {[50, 100, 200].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="border rounded-lg px-3 py-2 bg-white text-sm"
                          onClick={() => setDepositAmountInput(String(preset))}
                          disabled={paymentSaving}
                        >
                          £{preset}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="number"
                        min={10}
                        max={5000}
                        step="1"
                        className="w-full sm:w-44 border rounded-lg px-3 py-2"
                        value={depositAmountInput}
                        onChange={(e) => setDepositAmountInput(e.target.value)}
                        disabled={paymentSaving}
                      />
                      <button
                        type="button"
                        className="border rounded-lg px-4 py-2.5 bg-white disabled:opacity-50"
                        onClick={requestDeposit}
                        disabled={paymentSaving}
                      >
                        {paymentSaving ? "Requesting..." : "Request deposit"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {payment?.checkout_url && ["requires_payment", "pending", "failed", "canceled"].includes(String(payment.status || "").toLowerCase()) ? (
                  <div className="text-xs text-gray-600">
                    Customer pays from the public quote page link.
                  </div>
                ) : null}
              </div>
            ) : null}

            {isDirty ? (
              <div className="text-sm text-amber-700">
                Unsaved changes — click “Save draft” before sending.
              </div>
            ) : null}

            {saveStatus === "saving" ? (
              <div className="text-xs text-gray-600">Saving…</div>
            ) : null}
            {saveStatus === "saved" ? (
              <div className="text-xs text-green-700">Saved</div>
            ) : null}

            {/* Items */}
            <div className="rounded-xl border bg-gray-50 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Quote items</div>
                <button
                  className="w-full sm:w-auto border rounded-lg px-4 py-2.5 bg-white text-sm disabled:opacity-50"
                  onClick={addItem}
                  disabled={String(quote.status).toLowerCase() !== "draft" || saving || sending}
                  type="button"
                >
                  + Add item
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {(items || []).length === 0 ? (
                  <div className="text-sm text-gray-600">No items yet. Add one.</div>
                ) : (
                  items.map((it) => (
                    <div key={it.id} className="rounded-lg border bg-white p-3">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-6">
                          <label className="text-xs text-gray-600">Title</label>
                          <input
                            className="w-full border rounded-lg px-3 py-2"
                            value={it.title || ""}
                            disabled={String(quote.status).toLowerCase() !== "draft" || saving || sending}
                            onChange={(e) => updateItem(it.id, { title: e.target.value })}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-xs text-gray-600">Qty</label>
                          <input
                            type="number"
                            step="1"
                            className="w-full border rounded-lg px-3 py-2"
                            min={1}
                            value={it.qty ?? 1}
                            disabled={String(quote.status).toLowerCase() !== "draft" || saving || sending}
                            onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) })}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-xs text-gray-600">Unit price (£)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full border rounded-lg px-3 py-2"
                            min={0}
                            value={it.unit_price ?? 0}
                            disabled={String(quote.status).toLowerCase() !== "draft" || saving || sending}
                            onChange={(e) =>
                              updateItem(it.id, { unit_price: Number(e.target.value) })
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <div className="text-xs text-gray-600">Line total</div>
                          <div className="font-medium">£{money(calcLineTotal(it.qty, it.unit_price))}</div>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                        <div className="text-xs text-gray-500">Sort: {it.sort_order ?? 1}</div>
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                          <button
                            type="button"
                            className="border rounded-md px-3 py-2 bg-white text-sm disabled:opacity-50"
                            disabled={
                              String(quote.status).toLowerCase() !== "draft" || saving || sending
                            }
                            onClick={() => moveItem(it.id, "up")}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="border rounded-md px-3 py-2 bg-white text-sm disabled:opacity-50"
                            disabled={
                              String(quote.status).toLowerCase() !== "draft" || saving || sending
                            }
                            onClick={() => moveItem(it.id, "down")}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="border rounded-lg px-4 py-2 bg-white text-sm disabled:opacity-50"
                            disabled={
                              String(quote.status).toLowerCase() !== "draft" || saving || sending
                            }
                            onClick={() => removeItem(it.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            {hasItemValidationError ? (
              <div className="text-sm text-red-600">Fix item fields before saving.</div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-black text-white disabled:opacity-50"
                disabled={
                  String(quote.status).toLowerCase() !== "draft" ||
                  saving ||
                  sending ||
                  closing ||
                  reopening ||
                  hasItemValidationError
                }
                onClick={saveDraft}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>

              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-white disabled:opacity-50"
                disabled={
                  String(quote.status).toLowerCase() !== "draft" || saving || sending || closing || reopening || isDirty
                }
                onClick={sendQuote}
              >
                {sending ? "Sending…" : "Send quote (uses 1 credit)"}
              </button>

              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-white disabled:opacity-50"
                disabled={String(quote.status).toLowerCase() !== "sent" || linkBusy || saving || sending || closing || reopening}
                onClick={copyCustomerLink}
              >
                {linkBusy ? "Copying..." : "Copy customer link"}
              </button>

              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-white disabled:opacity-50"
                disabled={!["sent", "accepted", "declined", "closed"].includes(String(quote.status).toLowerCase()) || saving || sending || closing || reopening}
                onClick={openMessages}
              >
                Open messages
              </button>

              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-white disabled:opacity-50"
                disabled={String(quote.status).toLowerCase() !== "sent" || closing || saving || sending || reopening}
                onClick={closeQuote}
              >
                {closing ? "Closing..." : "Close quote"}
              </button>

              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-white disabled:opacity-50"
                disabled={String(quote.status).toLowerCase() !== "closed" || reopening || saving || sending || closing}
                onClick={reopenQuote}
              >
                {reopening ? "Reopening..." : "Reopen quote"}
              </button>

              <button
                type="button"
                className="w-full border rounded-lg px-4 py-2.5 bg-white"
                onClick={() => {
                  if (isDirty) {
                    const ok = window.confirm("You have unsaved changes. Discard and reload?");
                    if (!ok) return;
                  }
                  openQuote(quote.id);
                }}
                disabled={saving || sending || closing || reopening}
              >
                Reload
              </button>
            </div>

            <div className="text-xs text-gray-500">
              Sent quotes are locked. If a supplier has 0 credits, sending will be blocked server-side.
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

