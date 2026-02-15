import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  return fetch(path, { ...options, headers });
}

function money(value, currency = "GBP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function statusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "accepted") return "success";
  if (s === "declined" || s === "closed") return "danger";
  if (s === "sent") return "brand";
  if (s === "new") return "warning";
  return "neutral";
}

export default function CustomerEnquiryDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [messageTargets, setMessageTargets] = useState([]);
  const [messageOpen, setMessageOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState(null);
  const [messageState, setMessageState] = useState({
    loading: false,
    sending: false,
    error: "",
    threadId: "",
    messages: [],
    body: "",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await authFetch(`/api/customer/enquiries/${encodeURIComponent(String(id || ""))}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load enquiry");
        if (!mounted) return;
        setData(json);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load enquiry");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      setTargetsLoading(true);
      try {
        const resp = await authFetch(`/api/customer/enquiries/${encodeURIComponent(String(id))}/messaging-targets`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load messaging suppliers");
        if (!mounted) return;
        setMessageTargets(Array.isArray(json?.rows) ? json.rows : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load messaging suppliers");
      } finally {
        if (mounted) setTargetsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  const quoteRows = useMemo(() => (Array.isArray(data?.quotes) ? data.quotes : []), [data?.quotes]);
  const targetBySupplierId = useMemo(() => new Map((messageTargets || []).map((row) => [row.supplier_id, row])), [messageTargets]);

  async function quoteAction(quoteToken, type) {
    if (!quoteToken) return;
    setBusy(`${type}:${quoteToken}`);
    setError("");
    try {
      const endpoint = type === "accept" ? "/api/public-quote-accept" : "/api/public-quote-decline";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quoteToken }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || `Failed to ${type} quote`);
      const refresh = await authFetch(`/api/customer/enquiries/${encodeURIComponent(String(id || ""))}`);
      const refreshed = await refresh.json().catch(() => ({}));
      if (!refresh.ok) throw new Error(refreshed?.details || refreshed?.error || "Failed to refresh enquiry");
      setData(refreshed);
    } catch (err) {
      setError(err?.message || `Failed to ${type} quote`);
    } finally {
      setBusy("");
    }
  }

  async function fetchThreadMessages(threadId) {
    const resp = await authFetch(`/api/customer/threads/${encodeURIComponent(threadId)}/messages?limit=50`);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load messages");
    return {
      threadId: json?.thread?.id || threadId,
      messages: Array.isArray(json?.messages) ? json.messages : [],
    };
  }

  async function openMessaging(target) {
    if (!target?.supplier_id) return;
    setActiveTarget(target);
    setMessageOpen(true);
    setMessageState({
      loading: true,
      sending: false,
      error: "",
      threadId: target.thread_id || "",
      messages: [],
      body: "",
    });

    try {
      const createResp = await authFetch("/api/customer/threads/get-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enquiry_id: id,
          supplier_id: target.supplier_id,
          quote_id: target.quote_id || null,
        }),
      });
      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok) throw new Error(createJson?.details || createJson?.error || "Failed to open thread");

      const createdThreadId = createJson?.thread_id;
      if (!createdThreadId) throw new Error("Thread unavailable");

      const loaded = await fetchThreadMessages(createdThreadId);
      setMessageState((prev) => ({
        ...prev,
        loading: false,
        error: "",
        threadId: loaded.threadId,
        messages: loaded.messages,
      }));
      setMessageTargets((prev) =>
        (prev || []).map((row) =>
          row.supplier_id === target.supplier_id ? { ...row, thread_id: loaded.threadId, quote_id: row.quote_id || createJson?.quote_id || null } : row
        )
      );
    } catch (err) {
      setMessageState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Failed to open thread",
      }));
    }
  }

  async function sendMessage() {
    const threadId = String(messageState.threadId || "").trim();
    const bodyText = String(messageState.body || "").trim();
    if (!threadId || bodyText.length < 2) return;

    setMessageState((prev) => ({ ...prev, sending: true, error: "" }));
    try {
      const resp = await authFetch(`/api/customer/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: bodyText }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to send message");
      setMessageState((prev) => ({
        ...prev,
        sending: false,
        body: "",
        messages: json?.message ? [...prev.messages, json.message] : prev.messages,
      }));
    } catch (err) {
      setMessageState((prev) => ({
        ...prev,
        sending: false,
        error: err?.message || "Failed to send message",
      }));
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data?.enquiry) {
    return <EmptyState title="Enquiry unavailable" description={error || "This enquiry could not be loaded."} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Enquiry detail</span>
            <Badge variant={statusVariant(data.enquiry.status)}>{data.enquiry.status || "new"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p><span className="text-slate-500">Date:</span> {data.enquiry.eventDate || "-"}</p>
          <p><span className="text-slate-500">Guests:</span> {data.enquiry.guestCount ?? "-"}</p>
          <p><span className="text-slate-500">Venue:</span> {data.enquiry.venueName || "-"}</p>
          <p><span className="text-slate-500">Message:</span> {data.enquiry.message || "-"}</p>
          <div className="pt-2">
            <Button as={Link} to="/request" variant="secondary" size="sm">Create another enquiry</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invited suppliers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.invites || []).length === 0 ? (
            <p className="text-sm text-slate-600">No suppliers linked yet.</p>
          ) : (
            data.invites.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.supplierName}</span>
                    <Badge variant={statusVariant(row.status)}>{row.status || "invited"}</Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={targetsLoading}
                    onClick={() => openMessaging(targetBySupplierId.get(row.supplierId) || { supplier_id: row.supplierId, supplier_name: row.supplierName })}
                  >
                    Message supplier
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quoteRows.length === 0 ? (
            <p className="text-sm text-slate-600">No quotes received yet.</p>
          ) : (
            quoteRows.map((quote) => (
              <div key={quote.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{quote.supplierName}</p>
                    <Badge variant={statusVariant(quote.status)}>{quote.status}</Badge>
                  </div>
                  <p className="text-lg font-semibold text-slate-900">{money(quote.totalAmount, quote.currencyCode)}</p>
                </div>
                {(quote.items || []).length > 0 ? (
                  <ul className="text-sm text-slate-700 space-y-1">
                    {quote.items.map((item) => (
                      <li key={item.id}>{item.title}: {item.qty} x {money(item.unitPrice, quote.currencyCode)}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!quote.quoteToken || quote.status !== "sent" || !!busy}
                    onClick={() => quoteAction(quote.quoteToken, "accept")}
                  >
                    {busy === `accept:${quote.quoteToken}` ? "Accepting..." : "Accept"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!quote.quoteToken || quote.status !== "sent" || !!busy}
                    onClick={() => quoteAction(quote.quoteToken, "decline")}
                  >
                    {busy === `decline:${quote.quoteToken}` ? "Declining..." : "Decline"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title={`Message ${activeTarget?.supplier_name || "supplier"}`}
        footer={
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={messageState.loading || messageState.sending || String(messageState.body || "").trim().length < 2}
              onClick={sendMessage}
            >
              {messageState.sending ? "Sending..." : "Send"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMessageOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {messageState.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {messageState.error}
            </div>
          ) : null}
          <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {messageState.loading && messageState.messages.length === 0 ? (
              <p className="text-sm text-slate-500">Loading messages...</p>
            ) : messageState.messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet.</p>
            ) : (
              messageState.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.senderType === "customer"
                      ? "ml-auto bg-brand text-white"
                      : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <p>{msg.body}</p>
                  <p className={`mt-1 text-[11px] ${msg.senderType === "customer" ? "text-white/80" : "text-slate-500"}`}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "-"}
                  </p>
                </div>
              ))
            )}
          </div>
          <textarea
            value={messageState.body}
            onChange={(e) => setMessageState((prev) => ({ ...prev, body: e.target.value }))}
            rows={4}
            placeholder="Write your message..."
            className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            aria-label="Message body"
            disabled={messageState.loading || messageState.sending}
          />
        </div>
      </Modal>
    </div>
  );
}
