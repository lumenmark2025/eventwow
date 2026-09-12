import {
  JourneyShell as MarketingShell,
  JourneyCard as Card,
  JourneyCardContent as CardContent,
  JourneyCardHeader as CardHeader,
  JourneyCardTitle as CardTitle,
  JourneyState as EmptyState,
} from "../components/marketing/PublicJourneyComponents";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  PublicButton as Button,
  PublicPageHeader,
} from "../components/marketing/PublicComponents";

import Skeleton from "../components/ui/Skeleton";
import Badge from "../components/ui/Badge";

const ENABLE_DEPOSIT_PAYMENTS =
  String(import.meta.env.VITE_ENABLE_DEPOSIT_PAYMENTS || "").toLowerCase() ===
  "true";

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function moneyMinor(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : "0.00";
}

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function PublicQuotePage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [threadLoading, setThreadLoading] = useState(true);
  const [threadSaving, setThreadSaving] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [threadErr, setThreadErr] = useState("");
  const [threadOk, setThreadOk] = useState("");
  const [paymentErr, setPaymentErr] = useState("");

  const [note, setNote] = useState("");
  const [messageBody, setMessageBody] = useState("");

  const [data, setData] = useState(null);
  const [threadData, setThreadData] = useState(null);
  const [paymentData, setPaymentData] = useState(null);

  async function loadQuote() {
    setLoading(true);
    setErr("");

    try {
      const resp = await fetch(
        `/api/public-quote?token=${encodeURIComponent(token || "")}`,
      );
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        throw new Error(json?.details || json?.error || "Failed to load quote");
      }

      setData(json);
    } catch (e) {
      setData(null);
      setErr(e?.message || "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }

  async function loadThread() {
    if (!token) return;

    setThreadLoading(true);
    setThreadErr("");

    try {
      const resp = await fetch(
        `/api/public-thread?token=${encodeURIComponent(token || "")}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        throw new Error(
          json?.details || json?.error || "Failed to load messages",
        );
      }

      setThreadData({ thread: json.thread, messages: json.messages || [] });
    } catch (e) {
      setThreadData(null);
      setThreadErr(e?.message || "Failed to load messages");
    } finally {
      setThreadLoading(false);
    }
  }

  async function loadPayment() {
    if (!token) return;
    setPaymentLoading(true);
    setPaymentErr("");
    try {
      const resp = await fetch(
        `/api/public-payment-status?token=${encodeURIComponent(token || "")}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        throw new Error(
          json?.details || json?.error || "Failed to load payment",
        );
      }
      setPaymentData(json?.payment || null);
    } catch (e) {
      setPaymentData(null);
      setPaymentErr(e?.message || "Failed to load payment");
    } finally {
      setPaymentLoading(false);
    }
  }

  useEffect(() => {
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!ENABLE_DEPOSIT_PAYMENTS) {
      setPaymentLoading(false);
      setPaymentData(null);
      return;
    }
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const status = String(data?.quote?.status || "").toLowerCase();
  const reacceptRequired =
    !!data?.quote?.reaccept_required && status === "sent";
  const canAct = useMemo(() => status === "sent", [status]);

  useEffect(() => {
    const paymentFlag = String(searchParams.get("payment") || "").toLowerCase();
    if (paymentFlag === "success") {
      setOk("Payment completed. We are confirming your deposit status.");
      loadPayment();
    } else if (paymentFlag === "cancel") {
      setErr("Payment was canceled. You can try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function submitAccept() {
    if (!token || !canAct || saving) return;

    const confirmed = window.confirm("Accept this quote?");
    if (!confirmed) return;

    setSaving(true);
    setErr("");
    setOk("");

    try {
      const resp = await fetch("/api/public-quote-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, note }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        if (resp.status === 409)
          throw new Error(json?.details || "Quote can no longer be accepted");
        throw new Error(
          json?.details || json?.error || "Failed to accept quote",
        );
      }

      setData(json);
      setOk("Quote accepted.");
    } catch (e) {
      setErr(e?.message || "Failed to accept quote");
    } finally {
      setSaving(false);
    }
  }

  async function submitDecline() {
    if (!token || !canAct || saving) return;

    setSaving(true);
    setErr("");
    setOk("");

    try {
      const resp = await fetch("/api/public-quote-decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, note }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        if (resp.status === 409)
          throw new Error(json?.details || "Quote can no longer be declined");
        throw new Error(
          json?.details || json?.error || "Failed to decline quote",
        );
      }

      setData(json);
      setOk("Quote declined.");
    } catch (e) {
      setErr(e?.message || "Failed to decline quote");
    } finally {
      setSaving(false);
    }
  }

  async function sendPublicMessage() {
    if (!token || threadSaving) return;

    const body = String(messageBody || "").trim();
    if (!body) return;

    setThreadSaving(true);
    setThreadErr("");
    setThreadOk("");

    try {
      const clientMessageId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random()}`;
      const resp = await fetch("/api/public-send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, body, clientMessageId }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        if (resp.status === 429)
          throw new Error(json?.details || "Too many messages, please wait");
        throw new Error(
          json?.details || json?.error || "Failed to send message",
        );
      }

      const msg = json?.message;
      if (msg) {
        setThreadData((prev) => ({
          thread: prev?.thread || null,
          messages: [...(prev?.messages || []), msg],
        }));
      }

      setMessageBody("");
      setThreadOk("Message sent.");
    } catch (e) {
      setThreadErr(e?.message || "Failed to send message");
    } finally {
      setThreadSaving(false);
    }
  }

  async function startDepositPayment() {
    if (!token || paymentSaving) return;
    setPaymentSaving(true);
    setPaymentErr("");

    try {
      const resp = await fetch("/api/public-start-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("No deposit requested");
        if (resp.status === 409)
          throw new Error(
            json?.details || json?.error || "Deposit already paid",
          );
        throw new Error(
          json?.details || json?.error || "Failed to start payment",
        );
      }

      const checkoutUrl = String(json?.checkoutUrl || "").trim();
      if (!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.assign(checkoutUrl);
    } catch (e) {
      setPaymentErr(e?.message || "Failed to start payment");
    } finally {
      setPaymentSaving(false);
    }
  }

  if (loading) {
    return (
      <MarketingShell>
        <div role="status" aria-label="Loading" className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      </MarketingShell>
    );
  }

  if (err && !data) {
    return (
      <MarketingShell>
        <EmptyState page title="Quote not found" description={err} />
      </MarketingShell>
    );
  }

  const quote = data?.quote;
  const items = data?.items || [];

  return (
    <MarketingShell>
      <div className="space-y-6">
        <PublicPageHeader
          title="Your Quote"
          subtitle={`From ${data?.supplier?.name || "Supplier"}`}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant={
              status === "accepted"
                ? "success"
                : status === "declined"
                  ? "danger"
                  : "brand"
            }
          >
            {reacceptRequired
              ? "Updated - awaiting acceptance"
              : quote?.status || "Unavailable"}
          </Badge>
          {data?.enquiry?.event_date && <span>{data.enquiry.event_date}</span>}
          {data?.enquiry?.location_summary && (
            <span>{data.enquiry.location_summary}</span>
          )}
        </div>
        {ENABLE_DEPOSIT_PAYMENTS ? (
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="journey-body journey-muted">Event date</div>
                  <div className="font-medium">
                    {data?.enquiry?.event_date || "-"}
                  </div>
                  <div className="journey-body journey-muted">
                    {data?.enquiry?.location_summary || "-"}
                  </div>
                </div>
                <Badge
                  variant={
                    status === "accepted"
                      ? "success"
                      : status === "declined"
                        ? "danger"
                        : status === "closed"
                          ? "neutral"
                          : "brand"
                  }
                >
                  {reacceptRequired
                    ? "Updated - awaiting acceptance"
                    : quote?.status || "-"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {ok ? (
          <div
            role="status"
            className="rounded-lg border journey-success-border journey-success-surface px-3 py-2 journey-body journey-success"
          >
            {ok}
          </div>
        ) : null}
        {err ? (
          <div
            role="alert"
            className="rounded-lg border journey-error-border journey-error-surface px-3 py-2 journey-body journey-danger"
          >
            {err}
          </div>
        ) : null}

        {!canAct ? (
          <div className="rounded-lg border journey-border journey-soft px-3 py-2 journey-body journey-text">
            This quote is {quote?.status || "unavailable"}. Customer actions are
            disabled.
          </div>
        ) : null}
        {reacceptRequired ? (
          <div className="rounded-lg border journey-warning-border journey-warning-surface px-3 py-2 journey-body journey-warning">
            This quote has been updated since you accepted it. Please review and
            accept again to confirm.
          </div>
        ) : null}

        <div className="journey-quote-layout grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Quote Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {quote?.quote_text ? (
                <div className="rounded-xl border journey-border journey-soft px-3 py-2 journey-body journey-text whitespace-pre-wrap">
                  <p className="mb-1 journey-small font-medium uppercase tracking-wide journey-muted">
                    Message from supplier
                  </p>
                  {quote.quote_text}
                </div>
              ) : null}
              {items.length === 0 ? (
                <EmptyState
                  title="No quote items"
                  description="The supplier has not added line items yet."
                />
              ) : (
                items.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-lg border journey-border journey-soft px-3 py-2 journey-body"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{it.title || "Item"}</div>
                        {it.description ? (
                          <div className="journey-small journey-muted">
                            {it.description}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right journey-text">
                        {quote?.currency || "GBP"} {money(it.line_total)}
                      </div>
                    </div>
                    <div className="mt-1 journey-small journey-muted">
                      {Number(it.qty || 0)} x {quote?.currency || "GBP"}{" "}
                      {money(it.unit_price)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 journey-body">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>
                  {quote?.currency || "GBP"} {money(quote?.subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>
                  {quote?.tax === null || quote?.tax === undefined
                    ? "-"
                    : `${quote?.currency || "GBP"} ${money(quote?.tax)}`}
                </span>
              </div>
              <div className="journey-total mt-2 border-t journey-border pt-2 flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>
                  {quote?.currency || "GBP"} {money(quote?.total)}
                </span>
              </div>

              <div className="pt-3">
                <label
                  className="mb-1 block journey-small journey-muted"
                  htmlFor="note"
                >
                  Message (optional)
                </label>
                <textarea
                  id="note"
                  className="min-h-[90px] w-full rounded-xl border journey-border bg-white px-3 py-2 journey-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note for supplier"
                  disabled={!canAct || saving}
                />
              </div>

              {canAct ? (
                <div className="grid grid-cols-1 gap-2 pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={submitAccept}
                    disabled={saving}
                  >
                    {saving ? "Working..." : "Accept quote"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={submitDecline}
                    disabled={saving}
                  >
                    {saving ? "Working..." : "Decline quote"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="journey-small journey-muted">
          Sent: {fmtDate(quote?.sent_at)} - Accepted:{" "}
          {fmtDate(quote?.accepted_at)} - Declined:{" "}
          {fmtDate(quote?.declined_at)} - Closed: {fmtDate(quote?.closed_at)}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deposit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentErr ? (
              <div
                role="alert"
                className="rounded-lg border journey-error-border journey-error-surface px-3 py-2 journey-body journey-danger"
              >
                {paymentErr}
              </div>
            ) : null}

            {paymentLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !paymentData ? (
              <EmptyState
                title="No deposit requested"
                description="The supplier has not requested a deposit yet."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    variant={
                      String(paymentData.status || "").toLowerCase() === "paid"
                        ? "success"
                        : "brand"
                    }
                  >
                    {paymentData.status}
                  </Badge>
                  <div className="journey-body journey-muted">
                    Amount: {(paymentData.currency || "gbp").toUpperCase()}{" "}
                    {moneyMinor(paymentData.amount_total)}
                  </div>
                </div>

                {String(paymentData.status || "").toLowerCase() === "paid" ? (
                  <div
                    role="status"
                    className="rounded-lg border journey-success-border journey-success-surface px-3 py-2 journey-body journey-success"
                  >
                    Deposit received
                    {paymentData.paid_at
                      ? ` on ${fmtDate(paymentData.paid_at)}`
                      : ""}
                    .
                  </div>
                ) : null}

                {["requires_payment", "pending", "failed", "canceled"].includes(
                  String(paymentData.status || "").toLowerCase(),
                ) ? (
                  <Button
                    type="button"
                    onClick={startDepositPayment}
                    disabled={paymentSaving}
                  >
                    {paymentSaving ? "Redirecting..." : "Pay deposit"}
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {threadOk ? (
              <div
                role="status"
                className="rounded-lg border journey-success-border journey-success-surface px-3 py-2 journey-body journey-success"
              >
                {threadOk}
              </div>
            ) : null}
            {threadErr ? (
              <div
                role="alert"
                className="rounded-lg border journey-error-border journey-error-surface px-3 py-2 journey-body journey-danger"
              >
                {threadErr}
              </div>
            ) : null}

            {threadLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !threadData ? (
              <EmptyState
                title="Messages unavailable"
                description="Message thread could not be loaded."
              />
            ) : (
              <>
                <div
                  role="log"
                  aria-label="Message history"
                  className="max-h-[360px] space-y-2 overflow-auto rounded-xl border journey-border bg-white p-3"
                >
                  {(threadData.messages || []).length === 0 ? (
                    <EmptyState
                      title="No messages yet"
                      description="Start a conversation with your supplier."
                    />
                  ) : (
                    threadData.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-xl border journey-border journey-soft p-3 journey-body"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge
                            variant={
                              msg.senderType === "supplier"
                                ? "brand"
                                : "neutral"
                            }
                          >
                            {msg.senderType === "supplier" ? "Supplier" : "You"}
                          </Badge>
                          <span className="journey-small journey-muted">
                            {fmtDate(msg.createdAt)}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap journey-ink">
                          {msg.body}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <textarea
                    aria-label="Message to supplier"
                    className="min-h-[100px] w-full rounded-xl border journey-border bg-white px-3 py-2 journey-body shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                    placeholder="Send a message to your supplier..."
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    maxLength={2000}
                    disabled={threadSaving}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="journey-small journey-muted">
                      {messageBody.trim().length}/2000
                    </div>
                    <Button
                      type="button"
                      onClick={sendPublicMessage}
                      disabled={
                        threadSaving ||
                        messageBody.trim().length < 1 ||
                        messageBody.trim().length > 2000
                      }
                    >
                      {threadSaving ? "Sending..." : "Send message"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MarketingShell>
  );
}
