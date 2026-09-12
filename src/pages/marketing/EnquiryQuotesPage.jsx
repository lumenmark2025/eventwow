import {
  JourneyShell as MarketingShell,
  JourneyCard as Card,
  JourneyCardContent as CardContent,
  JourneyCardHeader as CardHeader,
  JourneyCardTitle as CardTitle,
  JourneyInput as Input,
  JourneyState as EmptyState,
  JourneyModal as Modal,
} from "../../components/marketing/PublicJourneyComponents";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "../../components/ui/Badge";
import {
  PublicButton as Button,
  PublicPageHeader,
  PublicSelect,
} from "../../components/marketing/PublicComponents";

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

function statusLabel(status, reacceptRequired = false) {
  if (reacceptRequired && String(status || "").toLowerCase() === "sent")
    return "Updated - awaiting acceptance";
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
}

function compareSort(sort, shortlistSet) {
  if (sort === "cheapest") {
    return (a, b) =>
      Number(a?.totals?.total || 0) - Number(b?.totals?.total || 0);
  }
  if (sort === "newest") {
    return (a, b) =>
      String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""));
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
    description:
      "Compare quotes, shortlist suppliers, and ask follow-up questions.",
    path: "/enquiry",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(
          `/api/public-enquiry-quotes?token=${encodeURIComponent(String(token || ""))}`,
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(
            json?.details || json?.error || "Failed to load enquiry",
          );
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

  const shortlistSet = useMemo(
    () => new Set(data?.shortlist || []),
    [data?.shortlist],
  );
  const quotes = useMemo(() => {
    const rows = Array.isArray(data?.quotes) ? [...data.quotes] : [];
    rows.sort(compareSort(sort, shortlistSet));
    if (shortlistedOnly) {
      return rows.filter((quote) =>
        shortlistSet.has(quote?.supplier?.supplierId),
      );
    }
    return rows;
  }, [data?.quotes, shortlistSet, shortlistedOnly, sort]);

  async function refreshQuotes() {
    const resp = await fetch(
      `/api/public-enquiry-quotes?token=${encodeURIComponent(String(token || ""))}`,
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(
        json?.details || json?.error || "Failed to refresh quotes",
      );
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
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to update shortlist",
        );
      setData((prev) =>
        prev ? { ...prev, shortlist: json.shortlist || [] } : prev,
      );
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

    const endpoint =
      action === "accept"
        ? "/api/public-quote-accept"
        : "/api/public-quote-decline";
    setSaving(`${action}:${quote.quoteId}`);
    setError("");
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quote.quoteToken }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || `Failed to ${action} quote`,
        );
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
      if (!startResp.ok)
        throw new Error(
          startJson?.details || startJson?.error || "Failed to open thread",
        );

      const quoteToken = startJson?.quoteToken;
      if (!quoteToken) throw new Error("Missing quote token for messaging");

      const threadResp = await fetch(
        `/api/public-thread?token=${encodeURIComponent(quoteToken)}`,
      );
      const threadJson = await threadResp.json().catch(() => ({}));
      if (!threadResp.ok)
        throw new Error(
          threadJson?.details || threadJson?.error || "Failed to load messages",
        );

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
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to send message",
        );

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
        <div role="status" aria-label="Loading" className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : !data ? (
        <EmptyState
          page
          title="Request not found"
          description={error || "The enquiry link is invalid or expired."}
        />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <PublicPageHeader title="Your quotes" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {data.enquiry?.eventDate ? (
                  <Badge variant="neutral">
                    Date: {data.enquiry.eventDate}
                  </Badge>
                ) : null}
                {data.enquiry?.guestCount ? (
                  <Badge variant="neutral">
                    Guests: {data.enquiry.guestCount}
                  </Badge>
                ) : null}
                {data.enquiry?.venueName || data.enquiry?.locationLabel ? (
                  <Badge variant="neutral">
                    {data.enquiry?.venueName || data.enquiry?.locationLabel}
                  </Badge>
                ) : null}
              </div>
              <p className="journey-body journey-muted">
                Compare supplier quotes, shortlist your favorites, and message
                suppliers before deciding.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-pressed={view === "list"}
              variant={view === "list" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setView("list")}
            >
              List
            </Button>
            <Button
              aria-pressed={view === "compare"}
              variant={view === "compare" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setView("compare")}
            >
              Compare
            </Button>
            <PublicSelect
              label="Sort quotes"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort quotes"
            >
              <option value="recommended">Recommended</option>
              <option value="cheapest">Cheapest</option>
              <option value="newest">Newest</option>
            </PublicSelect>
            <label className="inline-flex items-center gap-2 rounded-xl border journey-border bg-white px-3 py-2 journey-body journey-text">
              <input
                type="checkbox"
                checked={shortlistedOnly}
                onChange={(e) => setShortlistedOnly(e.target.checked)}
              />
              Shortlisted only
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border journey-error-border journey-error-surface px-3 py-2 journey-body journey-danger"
            >
              {error}
            </div>
          ) : null}

          {quotes.length === 0 ? (
            <EmptyState
              title="Waiting for suppliers"
              description="Quotes have not arrived yet. Check back shortly."
              action={
                <Button as={Link} to="/categories">
                  Browse suppliers
                </Button>
              }
            />
          ) : view === "compare" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Compare quotes</CardTitle>
                <p className="journey-small journey-muted mt-2">
                  Scroll across to compare all suppliers.
                </p>
              </CardHeader>
              <CardContent>
                <div
                  className="journey-comparison"
                  tabIndex={0}
                  role="region"
                  aria-label="Quote comparison, scroll for more suppliers"
                >
                  <table className="journey-comparison-table">
                    <caption className="sr-only">
                      Compare supplier prices, inclusions and decisions
                    </caption>
                    <thead>
                      <tr className="border-b journey-border text-left">
                        <th className="px-3 py-2 font-medium journey-muted">
                          Supplier
                        </th>
                        {quotes.map((q) => (
                          <th key={`head-${q.quoteId}`} className="px-3 py-2">
                            <div className="space-y-1">
                              <p className="font-semibold journey-ink">
                                {q.supplier?.name}
                              </p>
                              <Badge variant={statusVariant(q.quoteStatus)}>
                                {statusLabel(q.quoteStatus, q.reacceptRequired)}
                              </Badge>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium journey-text">
                          Total
                        </td>
                        {quotes.map((q) => (
                          <td
                            key={`total-${q.quoteId}`}
                            className="px-3 py-3 font-semibold journey-ink"
                          >
                            {money(q?.totals?.total, q?.totals?.currency)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium journey-text">
                          Top inclusions
                        </td>
                        {quotes.map((q) => (
                          <td
                            key={`inc-${q.quoteId}`}
                            className="px-3 py-3 align-top"
                          >
                            <ul className="space-y-1 journey-text">
                              {(q.items || []).slice(0, 3).map((item) => (
                                <li key={item.id}>• {item.description}</li>
                              ))}
                            </ul>
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium journey-text">
                          Supplier message
                        </td>
                        {quotes.map((q) => (
                          <td
                            key={`msg-${q.quoteId}`}
                            className="px-3 py-3 align-top journey-text whitespace-pre-wrap"
                          >
                            {q.quoteText || "-"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-3 py-3 font-medium journey-text">
                          Actions
                        </td>
                        {quotes.map((q) => (
                          <td key={`act-${q.quoteId}`} className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={q.quoteStatus !== "sent" || !!saving}
                                onClick={() => applyQuoteAction(q, "accept")}
                              >
                                {q.quoteStatus === "accepted"
                                  ? "Accepted"
                                  : "Accept"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openMessagePanel(q)}
                              >
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
                const shortlisted = shortlistSet.has(
                  quote?.supplier?.supplierId,
                );
                const isActive = activeQuoteId === quote.quoteId;
                return (
                  <Card key={quote.quoteId}>
                    <CardContent className="p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="journey-supplier-name">
                            {quote.supplier?.name}
                          </h2>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant={statusVariant(quote.quoteStatus)}>
                              {statusLabel(
                                quote.quoteStatus,
                                quote.reacceptRequired,
                              )}
                            </Badge>
                            {shortlisted ? (
                              <Badge variant="warning">Shortlisted</Badge>
                            ) : null}
                            {quote.supplier?.locationLabel ? (
                              <Badge variant="neutral">
                                {quote.supplier.locationLabel}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="journey-small uppercase tracking-wide journey-muted">
                            Total quote
                          </p>
                          <p className="text-2xl font-bold journey-ink">
                            {money(
                              quote?.totals?.total,
                              quote?.totals?.currency,
                            )}
                          </p>
                        </div>
                      </div>
                      {quote.reacceptRequired ? (
                        <div className="rounded-xl border journey-warning-border journey-warning-surface px-3 py-2 journey-body journey-warning">
                          This quote has been updated since you accepted it.
                          Please review and accept again to confirm.
                        </div>
                      ) : null}

                      <div className="rounded-xl border journey-border journey-soft p-3 journey-body journey-text">
                        <p className="font-medium journey-ink">Breakdown</p>
                        <div className="mt-2 space-y-1">
                          {(quote.items || []).map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span>{item.description}</span>
                              <span className="journey-muted">
                                {item.qty} x{" "}
                                {money(item.unitPrice, quote?.totals?.currency)}{" "}
                                ={" "}
                                {money(item.lineTotal, quote?.totals?.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {quote.quoteText ? (
                        <div className="rounded-xl border journey-border bg-white p-3 journey-body journey-text whitespace-pre-wrap">
                          <p className="mb-1 journey-small font-medium uppercase tracking-wide journey-muted">
                            Message from supplier
                          </p>
                          {quote.quoteText}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={quote.quoteStatus !== "sent" || !!saving}
                          onClick={() => applyQuoteAction(quote, "accept")}
                        >
                          {saving === `accept:${quote.quoteId}`
                            ? "Accepting..."
                            : quote.quoteStatus === "accepted"
                              ? "Accepted"
                              : "Accept quote"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={quote.quoteStatus !== "sent" || !!saving}
                          onClick={() => applyQuoteAction(quote, "decline")}
                        >
                          {saving === `decline:${quote.quoteId}`
                            ? "Declining..."
                            : quote.quoteStatus === "declined"
                              ? "Declined"
                              : "Decline"}
                        </Button>
                        <Button
                          variant={shortlisted ? "primary" : "secondary"}
                          disabled={
                            saving ===
                            `shortlist:${quote?.supplier?.supplierId}`
                          }
                          onClick={() =>
                            toggleShortlist(quote?.supplier?.supplierId)
                          }
                        >
                          {shortlisted ? "Shortlisted" : "Shortlist"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => openMessagePanel(quote)}
                        >
                          Ask a question
                        </Button>
                        <span className="ml-auto journey-small journey-muted">
                          Updated {fmtDate(quote.sentAt || quote.createdAt)}
                        </span>
                      </div>

                      {isActive && messageOpen ? (
                        <div className="rounded-xl border journey-border journey-soft px-3 py-2 journey-small journey-text">
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
                  disabled={
                    messageState.loading ||
                    String(messageState.body || "").trim().length < 1
                  }
                >
                  {messageState.loading ? "Sending..." : "Send"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setMessageOpen(false)}
                >
                  Done
                </Button>
              </div>
            }
          >
            <div className="space-y-3">
              {messageState.error ? (
                <div
                  role="alert"
                  className="rounded-xl border journey-error-border journey-error-surface px-3 py-2 journey-body journey-danger"
                >
                  {messageState.error}
                </div>
              ) : null}
              <div
                role="log"
                aria-label="Message history"
                className="max-h-72 space-y-2 overflow-auto rounded-xl border journey-border journey-soft p-3"
              >
                {messageState.loading && messageState.messages.length === 0 ? (
                  <p className="journey-body journey-muted">
                    Loading messages...
                  </p>
                ) : messageState.messages.length === 0 ? (
                  <p className="journey-body journey-muted">No messages yet.</p>
                ) : (
                  messageState.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 journey-body ${
                        msg.senderType === "customer"
                          ? "ml-auto journey-message-own"
                          : "bg-white border journey-border journey-ink"
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p
                        className={`mt-1 text-[11px] ${msg.senderType === "customer" ? "journey-muted" : "journey-muted"}`}
                      >
                        {fmtDate(msg.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <Input
                value={messageState.body}
                onChange={(e) =>
                  setMessageState((prev) => ({ ...prev, body: e.target.value }))
                }
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
