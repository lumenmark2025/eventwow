import {
  JourneyShell as MarketingShell,
  JourneyCard as Card,
  JourneyCardContent as CardContent,
  JourneyCardHeader as CardHeader,
  JourneyCardTitle as CardTitle,
  JourneyState as EmptyState,
} from "../../components/marketing/PublicJourneyComponents";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  PublicButton as Button,
  PublicPageHeader,
} from "../../components/marketing/PublicComponents";

import Badge from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";

function money(value, currency = "GBP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-GB");
  } catch {
    return value;
  }
}

function fmtDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-GB");
  } catch {
    return value;
  }
}

function parseQuoteToken(path) {
  const parts = String(path || "")
    .split("/")
    .filter(Boolean);
  if (parts.length >= 2 && parts[0] === "quote") return parts[1] || "";
  return "";
}

export default function BookingAccessPage() {
  const [params] = useSearchParams();
  const token = String(params.get("t") || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [threadData, setThreadData] = useState(null);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicMsg, setMagicMsg] = useState("");

  const returnTo = useMemo(
    () => `/booking-access?t=${encodeURIComponent(token)}`,
    [token],
  );

  const quoteToken = useMemo(
    () =>
      parseQuoteToken(data?.quote?.public_quote_path) ||
      String(data?.quote?.public_quote_token || ""),
    [data],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (active) setIsLoggedIn(!!sessionData?.session);

        const resp = await fetch(
          `/api/public/booking-access?t=${encodeURIComponent(token)}`,
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(
            json?.details || json?.error || "Booking unavailable",
          );
        if (active) setData(json);
      } catch (err) {
        if (active) setError(err?.message || "Booking unavailable");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    async function loadThread() {
      if (!isLoggedIn || !quoteToken) {
        setThreadData(null);
        setThreadError("");
        return;
      }
      setThreadLoading(true);
      setThreadError("");
      try {
        const resp = await fetch(
          `/api/public-thread?token=${encodeURIComponent(quoteToken)}`,
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(
            json?.details || json?.error || "Failed to load messages",
          );
        if (active)
          setThreadData({ thread: json.thread, messages: json.messages || [] });
      } catch (err) {
        if (active) {
          setThreadError(err?.message || "Failed to load messages");
          setThreadData(null);
        }
      } finally {
        if (active) setThreadLoading(false);
      }
    }
    loadThread();
    return () => {
      active = false;
    };
  }, [isLoggedIn, quoteToken]);

  async function sendMessage() {
    const body = String(messageBody || "").trim();
    if (!quoteToken || !body || sending) return;
    setSending(true);
    setThreadError("");
    try {
      const clientMessageId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random()}`;
      const resp = await fetch("/api/public-send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quoteToken, body, clientMessageId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to send message",
        );
      setThreadData((prev) => ({
        thread: prev?.thread || null,
        messages: [...(prev?.messages || []), json?.message].filter(Boolean),
      }));
      setMessageBody("");
    } catch (err) {
      setThreadError(err?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function sendMagicLink() {
    if (!token || magicBusy) return;
    setMagicBusy(true);
    setMagicMsg("");
    try {
      const resp = await fetch("/api/public/booking-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to send sign-in link",
        );
      setMagicMsg(
        json?.message ||
          "If the email matches, you will receive a sign-in link shortly.",
      );
    } catch (err) {
      setMagicMsg(err?.message || "Failed to send sign-in link");
    } finally {
      setMagicBusy(false);
    }
  }

  if (!token) {
    return (
      <MarketingShell>
        <EmptyState
          page
          title="Booking link missing"
          description="Please check your booking link."
        />
      </MarketingShell>
    );
  }

  if (loading) {
    return (
      <MarketingShell>
        <p className="journey-body journey-muted">Loading booking...</p>
      </MarketingShell>
    );
  }

  if (error || !data?.booking) {
    return (
      <MarketingShell>
        <EmptyState
          page
          title="Booking unavailable"
          description={error || "This booking link is invalid or expired."}
        />
      </MarketingShell>
    );
  }

  const booking = data.booking;
  const quote = data.quote;

  return (
    <MarketingShell>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <PublicPageHeader title="Booking details" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 journey-body journey-text md:grid-cols-2">
            <p>
              <span className="journey-muted">Date:</span>{" "}
              {fmtDate(booking.event_date)}
            </p>
            <p>
              <span className="journey-muted">Time:</span>{" "}
              {booking.start_time || "-"}
              {booking.end_time ? ` - ${booking.end_time}` : ""}
            </p>
            <p className="md:col-span-2">
              <span className="journey-muted">Location:</span>{" "}
              {booking.event_location_label || "Location not provided"}
            </p>
            <p>
              <span className="journey-muted">Guests:</span>{" "}
              {booking.guest_count ?? "-"}
            </p>
            <p>
              <span className="journey-muted">Status:</span>{" "}
              <Badge variant="neutral">{booking.status || "-"}</Badge>
            </p>
            <p>
              <span className="journey-muted">Value:</span>{" "}
              {booking.value_gross !== null ? money(booking.value_gross) : "-"}
            </p>
            <p>
              <span className="journey-muted">Deposit:</span>{" "}
              {booking.deposit_amount !== null
                ? money(booking.deposit_amount)
                : "-"}{" "}
              (
              {booking.is_deposit_paid
                ? `Paid ${fmtDate(booking.deposit_paid_at)}`
                : "Unpaid"}
              )
            </p>
            <p>
              <span className="journey-muted">Balance:</span>{" "}
              {booking.balance_amount !== null
                ? money(booking.balance_amount)
                : "-"}{" "}
              (
              {booking.is_balance_paid
                ? `Paid ${fmtDate(booking.balance_paid_at)}`
                : "Unpaid"}
              )
            </p>
          </CardContent>
        </Card>

        {quote ? (
          <Card>
            <CardHeader>
              <CardTitle>Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.quote_text ? (
                <div className="whitespace-pre-wrap rounded-lg border journey-border journey-soft px-3 py-2 journey-body">
                  {quote.quote_text}
                </div>
              ) : null}
              <div className="journey-body journey-text">
                <span className="journey-muted">Total:</span>{" "}
                {money(quote.total_amount, quote.currency_code || "GBP")}
              </div>
              {(quote.items || []).length > 0 ? (
                <ul className="space-y-1 journey-body journey-text">
                  {quote.items.map((item) => (
                    <li key={item.id}>
                      {item.title}: {item.qty} x{" "}
                      {money(item.unit_price, quote.currency_code || "GBP")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {quote.public_quote_path ? (
                <Button
                  as={Link}
                  to={quote.public_quote_path}
                  variant="secondary"
                >
                  Open quote page
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 journey-body">
            {!booking.message_thread_id ? (
              <p className="journey-text">No message thread linked yet.</p>
            ) : !quoteToken ? (
              <p className="journey-text">
                Messaging is available once a quote link is created.
              </p>
            ) : !isLoggedIn ? (
              <>
                <p className="journey-text">
                  Login to message your supplier about this booking.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    as={Link}
                    to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                  >
                    Login to message
                  </Button>
                  {booking.has_customer_email ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={sendMagicLink}
                      disabled={magicBusy}
                    >
                      {magicBusy
                        ? "Sending..."
                        : `Email sign-in link (${booking.customer_email_masked || "saved email"})`}
                    </Button>
                  ) : null}
                </div>
                {!booking.has_customer_email ? (
                  <p className="journey-small journey-muted">
                    Ask supplier to add your email to enable magic sign-in.
                  </p>
                ) : null}
                {magicMsg ? (
                  <p className="journey-small journey-muted">{magicMsg}</p>
                ) : null}
              </>
            ) : threadLoading ? (
              <p className="journey-text">Loading messages...</p>
            ) : (
              <>
                {threadError ? (
                  <p className="journey-danger">{threadError}</p>
                ) : null}
                <div
                  role="log"
                  aria-label="Message history"
                  className="max-h-[280px] space-y-2 overflow-auto rounded-xl border journey-border bg-white p-3"
                >
                  {(threadData?.messages || []).length === 0 ? (
                    <p className="journey-muted">No messages yet.</p>
                  ) : (
                    (threadData.messages || []).map((msg) => (
                      <div
                        key={msg.id}
                        className="rounded-lg border journey-border journey-soft p-2"
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
                            {fmtDateTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap journey-body journey-ink">
                          {msg.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <textarea
                    aria-label="Message to supplier"
                    className="min-h-[100px] w-full rounded-xl border journey-border bg-white px-3 py-2 journey-body"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Send a message..."
                    maxLength={2000}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="journey-small journey-muted">
                      {messageBody.trim().length}/2000
                    </span>
                    <Button
                      type="button"
                      onClick={sendMessage}
                      disabled={sending || messageBody.trim().length < 1}
                    >
                      {sending ? "Sending..." : "Send message"}
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
