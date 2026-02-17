import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import { useMarketingMeta } from "../../lib/marketingMeta";

function money(value, currency = "GBP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: String(currency || "GBP").toUpperCase(),
    }).format(amount);
  } catch {
    return `GBP ${amount.toFixed(2)}`;
  }
}

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusVariant(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted") return "success";
  if (normalized === "declined" || normalized === "closed") return "danger";
  if (normalized === "sent") return "brand";
  return "neutral";
}

function statusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
}

function compareSort(sort, shortlistSet) {
  if (sort === "cheapest") {
    return (a, b) => Number(a?.totals?.total || 0) - Number(b?.totals?.total || 0);
  }
  if (sort === "newest") {
    return (a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""));
  }
  return (a, b) => {
    const aShort = shortlistSet.has(a?.supplier?.supplierId) ? 1 : 0;
    const bShort = shortlistSet.has(b?.supplier?.supplierId) ? 1 : 0;
    if (aShort !== bShort) return bShort - aShort;
    const aScore = Number(a?.totals?.total || 0);
    const bScore = Number(b?.totals?.total || 0);
    return aScore - bScore;
  };
}

export default function EnquiryQuotesPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [data, setData] = useState(null);
  const [view, setView] = useState("list");
  const [sort, setSort] = useState("recommended");
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const [activeQuoteId, setActiveQuoteId] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageState, setMessageState] = useState({
    loading: false,
    error: "",
    quoteToken: "",
    threadId: "",
    quoteName: "",
    messages: [],
    body: "",
  });

  useMarketingMeta({
    title: "Your quotes",
    description: "Compare quotes, shortlist suppliers, and ask follow-up questions.",
    path: "/enquiry",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`/api/public-enquiry-quotes?token=${encodeURIComponent(String(token || ""))}`);
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
  }, [token]);

  useEffect(() => {
    let meta = document.head.querySelector("meta[name='robots']");
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex,nofollow");
    return () => {
      if (created && meta?.parentNode) {
        meta.parentNode.removeChild(meta);
      }
    };
  }, []);

  const shortlistSet = useMemo(() => new Set(data?.shortlist || []), [data?.shortlist]);
  const quotes = useMemo(() => {
    const rows = Array.isArray(data?.quotes) ? [...data.quotes] : [];
    rows.sort(compareSort(sort, shortlistSet));
    if (shortlistedOnly) {
      return rows.filter((quote) => shortlistSet.has(quote?.supplier?.supplierId));
    }
    return rows;
  }, [data?.quotes, shortlistSet, shortlistedOnly, sort]);

  async function refreshQuotes() {
    const resp = await fetch(`/api/public-enquiry-quotes?token=${encodeURIComponent(String(token || ""))}`);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.details || json?.error || "Failed to refresh quotes");
    }
    setData(json);
    return json;
  }

  async function toggleShortlist(supplierId) {
    if (!supplierId) return;
    const action = shortlistSet.has(supplierId) ? "remove" : "add";
    setSaving(`shortlist:${supplierId}`);
    setError("");
    try {
      const resp = await fetch("/api/public-toggle-shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, supplierId, action }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to update shortlist");
      setData((prev) => (prev ? { ...prev, shortlist: json.shortlist || [] } : prev));
    } catch (err) {
      setError(err?.message || "Failed to update shortlist");
    } finally {
      setSaving("");
    }
  }

  async function applyQuoteAction(quote, action) {
    if (!quote?.quoteToken) {
      setError("Quote link unavailable for this action.");
      return;
    }

    const endpoint = action === "accept" ? "/api/public-quote-accept" : "/api/public-quote-decline";
    setSaving(`${action}:${quote.quoteId}`);
    setError("");
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quote.quoteToken }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || `Failed to ${action} quote`);
      await refreshQuotes();
    } catch (err) {
      setError(err?.message || `Failed to ${action} quote`);
    } finally {
      setSaving("");
    }
  }

  async function openMessagePanel(quote) {
    setActiveQuoteId(quote.quoteId);
    setMessageOpen(true);
    setMessageState({
      loading: true,
      error: "",
      quoteToken: "",
      threadId: "",
      quoteName: quote?.supplier?.name || "Supplier",
      messages: [],
      body: "",
    });

    try {
      const startResp = await fetch("/api/public-start-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          supplierId: quote?.supplier?.supplierId,
          quoteId: quote?.quoteId,
        }),
      });
      const startJson = await startResp.json().catch(() => ({}));
      if (!startResp.ok) throw new Error(startJson?.details || startJson?.error || "Failed to open thread");

      const quoteToken = startJson?.quoteToken;
      if (!quoteToken) throw new Error("Missing quote token for messaging");

      const threadResp = await fetch(`/api/public-thread?token=${encodeURIComponent(quoteToken)}`);
      const threadJson = await threadResp.json().catch(() => ({}));
      if (!threadResp.ok) throw new Error(threadJson?.details || threadJson?.error || "Failed to load messages");

      setMessageState({
        loading: false,
        error: "",
        quoteToken,
        threadId: startJson?.threadId || threadJson?.thread?.id || "",
        quoteName: quote?.supplier?.name || "Supplier",
        messages: threadJson?.messages || [],
        body: "",
      });
    } catch (err) {
      setMessageState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Failed to load messages",
      }));
    }
  }

  async function sendMessage() {
    const bodyText = String(messageState.body || "").trim();
    if (!bodyText || !messageState.quoteToken) return;
    setMessageState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const resp = await fetch("/api/public-send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: messageState.quoteToken,
          threadId: messageState.threadId || null,
          messageText: bodyText,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to send message");

      const newMessage = json?.message;
      setMessageState((prev) => ({
        ...prev,
        loading: false,
        body: "",
        messages: newMessage ? [...prev.messages, newMessage] : prev.messages,
      }));
    } catch (err) {
      setMessageState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Failed to send message",
      }));
    }
  }

  return (
    <MarketingShell>
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : !data ? (
        <EmptyState title="Request not found" description={error || "The enquiry link is invalid or expired."} />
      ) : (
        <div className="space-y-5">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">Your quotes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {data.enquiry?.eventDate ? <Badge variant="neutral">Date: {data.enquiry.eventDate}</Badge> : null}
                {data.enquiry?.guestCount ? <Badge variant="neutral">Guests: {data.enquiry.guestCount}</Badge> : null}
                {(data.enquiry?.venueName || data.enquiry?.locationLabel) ? (
                  <Badge variant="neutral">{data.enquiry?.venueName || data.enquiry?.locationLabel}</Badge>
                ) : null}
              </div>
              <p className="text-sm text-slate-600">
                Compare supplier quotes, shortlist your favorites, and message suppliers before deciding.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={view === "list" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setView("list")}
            >
              List
            </Button>
            <Button
              variant={view === "compare" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setView("compare")}
            >
              Compare
            </Button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              aria-label="Sort quotes"
            >
              <option value="recommended">Recommended</option>
              <option value="cheapest">Cheapest</option>
              <option value="newest">Newest</option>
            </select>
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={shortlistedOnly}
                onChange={(e) => setShortlistedOnly(e.target.checked)}
              />
              Shortlisted only
            </label>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {quotes.length === 0 ? (
            <EmptyState
              title="Waiting for suppliers"
              description="Quotes have not arrived yet. Check back shortly."
              action={<Button as={Link} to="/categories">Browse suppliers</Button>}
            />
          ) : view === "compare" ? (
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="text-xl">Compare quotes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left">
                        <th className="px-3 py-2 font-medium text-slate-600">Supplier</th>
                        {quotes.map((q) => (
                          <th key={`head-${q.quoteId}`} className="px-3 py-2">
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900">{q.supplier?.name}</p>
                              <Badge variant={statusVariant(q.quoteStatus)}>{statusLabel(q.quoteStatus)}</Badge>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium text-slate-700">Total</td>
                        {quotes.map((q) => (
                          <td key={`total-${q.quoteId}`} className="px-3 py-3 font-semibold text-slate-900">
                            {money(q?.totals?.total, q?.totals?.currency)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium text-slate-700">Top inclusions</td>
                        {quotes.map((q) => (
                          <td key={`inc-${q.quoteId}`} className="px-3 py-3 align-top">
                            <ul className="space-y-1 text-slate-700">
                              {(q.items || []).slice(0, 3).map((item) => (
                                <li key={item.id}>• {item.description}</li>
                              ))}
                            </ul>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-3 py-3 font-medium text-slate-700">Actions</td>
                        {quotes.map((q) => (
                          <td key={`act-${q.quoteId}`} className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={q.quoteStatus !== "sent" || !!saving}
                                onClick={() => applyQuoteAction(q, "accept")}
                              >
                                {q.quoteStatus === "accepted" ? "Accepted" : "Accept"}
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => openMessagePanel(q)}>
                                Ask
                              </Button>
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {quotes.map((quote) => {
                const shortlisted = shortlistSet.has(quote?.supplier?.supplierId);
                const isActive = activeQuoteId === quote.quoteId;
                return (
                  <Card key={quote.quoteId} className="rounded-3xl">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">{quote.supplier?.name}</p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant={statusVariant(quote.quoteStatus)}>{statusLabel(quote.quoteStatus)}</Badge>
                            {shortlisted ? <Badge variant="warning">Shortlisted</Badge> : null}
                            {quote.supplier?.locationLabel ? <Badge variant="neutral">{quote.supplier.locationLabel}</Badge> : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Total quote</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {money(quote?.totals?.total, quote?.totals?.currency)}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Breakdown</p>
                        <div className="mt-2 space-y-1">
                          {(quote.items || []).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2">
                              <span>{item.description}</span>
                              <span className="text-slate-600">
                                {item.qty} x {money(item.unitPrice, quote?.totals?.currency)} = {money(item.lineTotal, quote?.totals?.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={quote.quoteStatus !== "sent" || !!saving}
                          onClick={() => applyQuoteAction(quote, "accept")}
                        >
                          {saving === `accept:${quote.quoteId}` ? "Accepting..." : quote.quoteStatus === "accepted" ? "Accepted" : "Accept quote"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={quote.quoteStatus !== "sent" || !!saving}
                          onClick={() => applyQuoteAction(quote, "decline")}
                        >
                          {saving === `decline:${quote.quoteId}` ? "Declining..." : quote.quoteStatus === "declined" ? "Declined" : "Decline"}
                        </Button>
                        <Button
                          variant={shortlisted ? "primary" : "secondary"}
                          disabled={saving === `shortlist:${quote?.supplier?.supplierId}`}
                          onClick={() => toggleShortlist(quote?.supplier?.supplierId)}
                        >
                          {shortlisted ? "Shortlisted" : "Shortlist"}
                        </Button>
                        <Button variant="ghost" onClick={() => openMessagePanel(quote)}>
                          Ask a question
                        </Button>
                        <span className="ml-auto text-xs text-slate-500">Updated {fmtDate(quote.sentAt || quote.createdAt)}</span>
                      </div>

                      {isActive && messageOpen ? (
                        <div className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-slate-700">
                          Messaging panel open for this quote.
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Modal
            open={messageOpen}
            onClose={() => setMessageOpen(false)}
            title={`Ask ${messageState.quoteName || "supplier"} a question`}
            footer={
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={sendMessage}
                  disabled={messageState.loading || String(messageState.body || "").trim().length < 1}
                >
                  {messageState.loading ? "Sending..." : "Send"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setMessageOpen(false)}>
                  Done
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
                          : "bg-white border border-slate-200 text-slate-800"
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p className={`mt-1 text-[11px] ${msg.senderType === "customer" ? "text-white/80" : "text-slate-500"}`}>
                        {fmtDate(msg.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <Input
                value={messageState.body}
                onChange={(e) => setMessageState((prev) => ({ ...prev, body: e.target.value }))}
                placeholder="Write your question..."
                aria-label="Message body"
              />
            </div>
          </Modal>
        </div>
      )}
    </MarketingShell>
  );
}
