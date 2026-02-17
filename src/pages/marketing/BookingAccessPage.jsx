import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import Badge from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";

function money(value, currency = "GBP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
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
  const parts = String(path || "").split("/").filter(Boolean);
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

  const returnTo = useMemo(() => `/booking-access?t=${encodeURIComponent(token)}`, [token]);

  const quoteToken = useMemo(
    () => parseQuoteToken(data?.quote?.public_quote_path) || String(data?.quote?.public_quote_token || ""),
    [data]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (active) setIsLoggedIn(!!sessionData?.session);

        const resp = await fetch(`/api/public/booking-access?t=${encodeURIComponent(token)}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Booking unavailable");
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
        const resp = await fetch(`/api/public-thread?token=${encodeURIComponent(quoteToken)}`);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load messages");
        if (active) setThreadData({ thread: json.thread, messages: json.messages || [] });
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
      const clientMessageId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
      const resp = await fetch("/api/public-send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quoteToken, body, clientMessageId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to send message");
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
      if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to send sign-in link");
      setMagicMsg(json?.message || "If the email matches, you will receive a sign-in link shortly.");
    } catch (err) {
      setMagicMsg(err?.message || "Failed to send sign-in link");
    } finally {
      setMagicBusy(false);
    }
  }

  if (!token) {
    return (
      <MarketingShell>
        <EmptyState title="Booking link missing" description="Please check your booking link." />
      </MarketingShell>
    );
  }

  if (loading) {
    return (
      <MarketingShell>
        <p className="text-sm text-slate-600">Loading booking...</p>
      </MarketingShell>
    );
  }

  if (error || !data?.booking) {
    return (
      <MarketingShell>
        <EmptyState title="Booking unavailable" description={error || "This booking link is invalid or expired."} />
      </MarketingShell>
    );
  }

  const booking = data.booking;
  const quote = data.quote;

  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Booking details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
            <p><span className="text-slate-500">Date:</span> {fmtDate(booking.event_date)}</p>
            <p><span className="text-slate-500">Time:</span> {booking.start_time || "-"}{booking.end_time ? ` - ${booking.end_time}` : ""}</p>
            <p className="md:col-span-2"><span className="text-slate-500">Location:</span> {booking.event_location_label || "Location not provided"}</p>
            <p><span className="text-slate-500">Guests:</span> {booking.guest_count ?? "-"}</p>
            <p><span className="text-slate-500">Status:</span> <Badge variant="neutral">{booking.status || "-"}</Badge></p>
            <p><span className="text-slate-500">Value:</span> {booking.value_gross !== null ? money(booking.value_gross) : "-"}</p>
            <p><span className="text-slate-500">Deposit:</span> {booking.deposit_amount !== null ? money(booking.deposit_amount) : "-"} ({booking.is_deposit_paid ? `Paid ${fmtDate(booking.deposit_paid_at)}` : "Unpaid"})</p>
            <p><span className="text-slate-500">Balance:</span> {booking.balance_amount !== null ? money(booking.balance_amount) : "-"} ({booking.is_balance_paid ? `Paid ${fmtDate(booking.balance_paid_at)}` : "Unpaid"})</p>
          </CardContent>
        </Card>

        {quote ? (
          <Card>
            <CardHeader>
              <CardTitle>Quote summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.quote_text ? (
                <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {quote.quote_text}
                </div>
              ) : null}
              <div className="text-sm text-slate-700">
                <span className="text-slate-500">Total:</span> {money(quote.total_amount, quote.currency_code || "GBP")}
              </div>
              {(quote.items || []).length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-700">
                  {quote.items.map((item) => (
                    <li key={item.id}>
                      {item.title}: {item.qty} x {money(item.unit_price, quote.currency_code || "GBP")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {quote.public_quote_path ? (
                <Button as={Link} to={quote.public_quote_path} variant="secondary">
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
          <CardContent className="space-y-3 text-sm">
            {!booking.message_thread_id ? (
              <p className="text-slate-700">No message thread linked yet.</p>
            ) : !quoteToken ? (
              <p className="text-slate-700">Messaging is available once a quote link is created.</p>
            ) : !isLoggedIn ? (
              <>
                <p className="text-slate-700">Login to message your supplier about this booking.</p>
                <div className="flex flex-wrap gap-2">
                  <Button as={Link} to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                    Login to message
                  </Button>
                  {booking.has_customer_email ? (
                    <Button type="button" variant="secondary" onClick={sendMagicLink} disabled={magicBusy}>
                      {magicBusy ? "Sending..." : `Email sign-in link (${booking.customer_email_masked || "saved email"})`}
                    </Button>
                  ) : null}
                </div>
                {!booking.has_customer_email ? (
                  <p className="text-xs text-slate-600">Ask supplier to add your email to enable magic sign-in.</p>
                ) : null}
                {magicMsg ? <p className="text-xs text-slate-600">{magicMsg}</p> : null}
              </>
            ) : threadLoading ? (
              <p className="text-slate-700">Loading messages...</p>
            ) : (
              <>
                {threadError ? <p className="text-rose-700">{threadError}</p> : null}
                <div className="max-h-[280px] space-y-2 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
                  {(threadData?.messages || []).length === 0 ? (
                    <p className="text-slate-600">No messages yet.</p>
                  ) : (
                    (threadData.messages || []).map((msg) => (
                      <div key={msg.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant={msg.senderType === "supplier" ? "brand" : "neutral"}>
                            {msg.senderType === "supplier" ? "Supplier" : "You"}
                          </Badge>
                          <span className="text-xs text-slate-500">{fmtDateTime(msg.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{msg.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <textarea
                    className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Send a message..."
                    maxLength={2000}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{messageBody.trim().length}/2000</span>
                    <Button type="button" onClick={sendMessage} disabled={sending || messageBody.trim().length < 1}>
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
