import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Modal,
  Skeleton,
  Feedback,
  FormField,
  Textarea,
  Section,
} from "../../components/workspace/AdminPrimitives";
import { DataTable } from "../../components/workspace/WorkspaceComponents";
import { ConversationThread } from "../../components/workspace/ConversationThread";

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  return fetch(path, { ...options, headers });
}

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

function statusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "accepted") return "success";
  if (s === "declined" || s === "closed") return "danger";
  if (s === "sent") return "brand";
  if (s === "new") return "warning";
  return "neutral";
}

function quoteStatusLabel(quote) {
  if (
    String(quote?.status || "").toLowerCase() === "sent" &&
    quote?.reacceptRequired
  ) {
    return "Updated - awaiting acceptance";
  }
  return String(quote?.status || "unknown");
}

export default function CustomerEnquiryDetail() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [retry, setRetry] = useState(0);
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
        const resp = await authFetch(
          `/api/customer/enquiries/${encodeURIComponent(String(id || ""))}`,
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
  }, [id, retry]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) return;
      setTargetsLoading(true);
      try {
        const resp = await authFetch(
          `/api/customer/enquiries/${encodeURIComponent(String(id))}/messaging-targets`,
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(
            json?.details ||
              json?.error ||
              "Failed to load messaging suppliers",
          );
        if (!mounted) return;
        setMessageTargets(Array.isArray(json?.rows) ? json.rows : []);
      } catch (err) {
        if (mounted)
          setError(err?.message || "Failed to load messaging suppliers");
      } finally {
        if (mounted) setTargetsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, retry]);

  const quoteRows = useMemo(
    () => (Array.isArray(data?.quotes) ? data.quotes : []),
    [data?.quotes],
  );
  const targetBySupplierId = useMemo(
    () => new Map((messageTargets || []).map((row) => [row.supplier_id, row])),
    [messageTargets],
  );

  async function quoteAction(quoteToken, type) {
    if (!quoteToken) return;
    setBusy(`${type}:${quoteToken}`);
    setError("");
    try {
      const endpoint =
        type === "accept"
          ? "/api/public-quote-accept"
          : "/api/public-quote-decline";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: quoteToken }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || `Failed to ${type} quote`,
        );
      const refresh = await authFetch(
        `/api/customer/enquiries/${encodeURIComponent(String(id || ""))}`,
      );
      const refreshed = await refresh.json().catch(() => ({}));
      if (!refresh.ok)
        throw new Error(
          refreshed?.details || refreshed?.error || "Failed to refresh enquiry",
        );
      setData(refreshed);
    } catch (err) {
      setError(err?.message || `Failed to ${type} quote`);
    } finally {
      setBusy("");
    }
  }

  async function fetchThreadMessages(threadId) {
    const resp = await authFetch(
      `/api/customer/threads/${encodeURIComponent(threadId)}/messages?limit=50`,
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok)
      throw new Error(
        json?.details || json?.error || "Failed to load messages",
      );
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
      const createResp = await authFetch(
        "/api/customer/threads/get-or-create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enquiry_id: id,
            supplier_id: target.supplier_id,
            quote_id: target.quote_id || null,
          }),
        },
      );
      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok)
        throw new Error(
          createJson?.details || createJson?.error || "Failed to open thread",
        );

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
          row.supplier_id === target.supplier_id
            ? {
                ...row,
                thread_id: loaded.threadId,
                quote_id: row.quote_id || createJson?.quote_id || null,
              }
            : row,
        ),
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
      const resp = await authFetch(
        `/api/customer/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: bodyText }),
        },
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          json?.details || json?.error || "Failed to send message",
        );
      setMessageState((prev) => ({
        ...prev,
        sending: false,
        body: "",
        messages: json?.message
          ? [...prev.messages, json.message]
          : prev.messages,
      }));
    } catch (err) {
      setMessageState((prev) => ({
        ...prev,
        sending: false,
        error: err?.message || "Failed to send message",
      }));
    }
  }

  const conversationMessages = useMemo(
    () =>
      messageState.messages.map((msg) => ({
        id: msg.id,
        own: msg.senderType === "customer",
        sender:
          msg.senderType === "customer"
            ? "You"
            : activeTarget?.supplier_name || "Supplier",
        body: msg.body,
        createdAt: msg.createdAt,
        when: msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "-",
      })),
    [messageState.messages, activeTarget?.supplier_name],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Enquiry details"
          subtitle="Loading your event request."
        />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data?.enquiry || String(data.enquiry.id) !== String(id)) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Enquiry unavailable"
          subtitle="Your event request could not be loaded."
        />
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error || "This enquiry could not be loaded."}
        </Feedback>
        <Button as={Link} to="/customer/enquiries" variant="secondary">
          Back to enquiries
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enquiry details"
        subtitle="Review your event, supplier quotes and conversations."
        actions={[
          {
            key: "back",
            label: "Back to enquiries",
            as: Link,
            to: "/customer/enquiries",
            variant: "secondary",
          },
          {
            key: "new",
            label: "Create another enquiry",
            as: Link,
            to: "/request",
            variant: "secondary",
          },
        ]}
      />
      {error && (
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error}
        </Feedback>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Your event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge variant={statusVariant(data.enquiry.status)}>
            {data.enquiry.status || "new"}
          </Badge>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="ew-form-help">Date</dt>
              <dd>{data.enquiry.eventDate || "Not provided"}</dd>
            </div>
            <div>
              <dt className="ew-form-help">Start time</dt>
              <dd>{data.enquiry.startTime || "Not provided"}</dd>
            </div>
            <div>
              <dt className="ew-form-help">Guests</dt>
              <dd>{data.enquiry.guestCount ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="ew-form-help">Venue / location</dt>
              <dd>{data.enquiry.venueName || "Not provided"}</dd>
            </div>
          </dl>
          <div>
            <p className="ew-form-help">Your message</p>
            <p className="whitespace-pre-wrap">
              {data.enquiry.message || "No message provided."}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invited suppliers</CardTitle>
        </CardHeader>
        <DataTable
          className="ew-admin-table"
          caption="Suppliers invited to your enquiry"
          rows={data.invites || []}
          emptyTitle="No suppliers linked yet"
          emptyDescription="Invited suppliers will appear here."
          columns={[
            { key: "supplierName", label: "Supplier" },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <Badge variant={statusVariant(row.status)}>
                  {row.status || "invited"}
                </Badge>
              ),
            },
            {
              key: "message",
              label: "Conversation",
              render: (row) => (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={targetsLoading}
                  onClick={() =>
                    openMessaging(
                      targetBySupplierId.get(row.supplierId) || {
                        supplier_id: row.supplierId,
                        supplier_name: row.supplierName,
                      },
                    )
                  }
                >
                  Message supplier
                  <span className="sr-only">: {row.supplierName}</span>
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Supplier quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {quoteRows.length === 0 ? (
            <EmptyState
              title="No quotes received yet"
              description="Quotes from your suppliers will appear here."
            />
          ) : (
            quoteRows.map((quote) => (
              <Section
                key={quote.id}
                title={quote.supplierName}
                right={
                  <strong className="text-lg">
                    {money(quote.totalAmount, quote.currencyCode)}
                  </strong>
                }
              >
                <div className="space-y-4">
                  <Badge variant={statusVariant(quote.status)}>
                    {quoteStatusLabel(quote)}
                  </Badge>
                  {quote.reacceptRequired && (
                    <Feedback tone="warning">
                      This quote has been updated since you accepted it. Please
                      review and accept again to confirm.
                    </Feedback>
                  )}
                  {quote.quoteText && (
                    <div>
                      <p className="ew-form-help">Message from supplier</p>
                      <p className="whitespace-pre-wrap">{quote.quoteText}</p>
                    </div>
                  )}
                  {(quote.items || []).length > 0 && (
                    <DataTable
                      className="ew-admin-table"
                      caption={`${quote.supplierName} quote items`}
                      rows={quote.items}
                      columns={[
                        { key: "title", label: "Included item" },
                        { key: "qty", label: "Quantity" },
                        {
                          key: "unitPrice",
                          label: "Unit price",
                          render: (item) =>
                            money(item.unitPrice, quote.currencyCode),
                        },
                      ]}
                    />
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="sm"
                      aria-label={`Accept quote from ${quote.supplierName}`}
                      disabled={
                        !quote.quoteToken || quote.status !== "sent" || !!busy
                      }
                      onClick={() => quoteAction(quote.quoteToken, "accept")}
                    >
                      {busy === `accept:${quote.quoteToken}`
                        ? "Accepting..."
                        : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Decline quote from ${quote.supplierName}`}
                      disabled={
                        !quote.quoteToken || quote.status !== "sent" || !!busy
                      }
                      onClick={() => quoteAction(quote.quoteToken, "decline")}
                    >
                      {busy === `decline:${quote.quoteToken}`
                        ? "Declining..."
                        : "Decline"}
                    </Button>
                  </div>
                </div>
              </Section>
            ))
          )}
        </CardContent>
      </Card>
      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title={`Message ${activeTarget?.supplier_name || "supplier"}`}
        footer={
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={
                messageState.loading ||
                messageState.sending ||
                !messageState.threadId ||
                String(messageState.body || "").trim().length < 2
              }
              onClick={sendMessage}
            >
              {messageState.sending ? "Sending..." : "Send"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMessageOpen(false)}
            >
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {messageState.error && <Feedback>{messageState.error}</Feedback>}
          {messageState.loading ? (
            <div>
              <p role="status">Loading messages...</p>
              <Skeleton className="h-40" />
            </div>
          ) : messageState.error && messageState.messages.length === 0 ? (
            <p className="ew-form-help">
              Close and reopen this conversation to try again.
            </p>
          ) : (
            <ConversationThread
              title={activeTarget?.supplier_name || "Supplier"}
              subtitle={data.enquiry.venueName || "Your enquiry"}
              messages={conversationMessages}
            />
          )}
          <div className="ew-message-composer">
            <FormField
              label="Message body"
              help="Discuss the details of this enquiry with your supplier."
            >
              <Textarea
                value={messageState.body}
                onChange={(e) =>
                  setMessageState((prev) => ({ ...prev, body: e.target.value }))
                }
                rows={4}
                placeholder="Write your message..."
                disabled={messageState.loading || messageState.sending}
              />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
