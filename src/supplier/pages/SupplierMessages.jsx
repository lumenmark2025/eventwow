import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../../components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Badge,
  EmptyState,
  Skeleton,
  Feedback,
} from "../../components/workspace/AdminPrimitives";
import {
  ConversationThread,
  MessageComposer,
} from "../../components/workspace/ConversationThread";
import { supabase } from "../../lib/supabase";

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function threadTitle(thread) {
  const venue = thread?.quote?.venueName || "Quote";
  const eventDate = thread?.quote?.eventDate
    ? ` - ${thread.quote.eventDate}`
    : "";
  return `${venue}${eventDate}`;
}

function customerNameFromThread(thread) {
  const explicit = String(
    thread?.quote?.customerName || thread?.thread?.quote?.customerName || "",
  ).trim();
  if (explicit) return explicit;

  const email = String(
    thread?.quote?.customerEmail || thread?.thread?.quote?.customerEmail || "",
  )
    .trim()
    .toLowerCase();
  if (!email.includes("@")) return "Customer";
  const localPart = email.split("@")[0] || "";
  if (!localPart) return "Customer";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Customer";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Not authenticated");

  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
}

export default function SupplierMessages({ supplierId, initialThreadId = "" }) {
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(
    initialThreadId || "",
  );
  const [threadData, setThreadData] = useState(null);
  const [messageBody, setMessageBody] = useState("");
  const [search, setSearch] = useState("");

  const threadRequest = useRef(0);

  async function loadThreads() {
    if (!supplierId) return;

    setThreadsLoading(true);
    setErr("");

    try {
      const resp = await authFetch("/api/supplier-threads");
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to load threads",
        );
      }

      const rows = json?.threads || [];
      setThreads(rows);
    } catch (e) {
      setErr(e?.message || "Failed to load threads");
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadThread(threadId) {
    if (!threadId) return;

    const request = ++threadRequest.current;
    setThreadLoading(true);
    setErr("");

    try {
      const resp = await authFetch(
        `/api/supplier-thread?threadId=${encodeURIComponent(threadId)}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to load thread",
        );
      }

      if (request !== threadRequest.current) return;
      setThreadData({ thread: json.thread, messages: json.messages || [] });
      setThreads((prev) =>
        prev.map((row) =>
          row.id === threadId
            ? { ...row, unread: false, lastReadAt: new Date().toISOString() }
            : row,
        ),
      );
    } catch (e) {
      if (request !== threadRequest.current) return;
      setThreadData(null);
      setErr(e?.message || "Failed to load thread");
    } finally {
      if (request === threadRequest.current) setThreadLoading(false);
    }
  }

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  useEffect(() => {
    if (!selectedThreadId) return;
    loadThread(selectedThreadId);
  }, [selectedThreadId]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;

    return threads.filter((t) => {
      const haystack = [
        customerNameFromThread(t),
        t?.quote?.venueName,
        t?.quote?.eventDate,
        t?.quote?.eventPostcode,
        t?.lastMessage?.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [threads, search]);

  const selectedThreadRow = useMemo(() => {
    return threads.find((x) => x.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  async function sendMessage() {
    if (!selectedThreadId || sending) return;

    const body = String(messageBody || "").trim();
    if (!body) return;

    setSending(true);
    setErr("");
    setOk("");

    try {
      const clientMessageId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random()}`;

      const resp = await authFetch("/api/supplier-send-message", {
        method: "POST",
        body: JSON.stringify({
          threadId: selectedThreadId,
          body,
          clientMessageId,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to send message",
        );
      }

      const nextMsg = json?.message;
      if (nextMsg) {
        setThreadData((prev) => ({
          thread: prev?.thread || { id: selectedThreadId },
          messages: [...(prev?.messages || []), nextMsg],
        }));

        const nowIso = nextMsg.createdAt || new Date().toISOString();
        setThreads((prev) =>
          prev
            .map((row) =>
              row.id === selectedThreadId
                ? {
                    ...row,
                    updatedAt: nowIso,
                    unread: false,
                    lastReadAt: nowIso,
                    lastMessage: {
                      body:
                        body.length > 120 ? `${body.slice(0, 117)}...` : body,
                      senderType: "supplier",
                      createdAt: nowIso,
                    },
                  }
                : row,
            )
            .sort((a, b) =>
              String(b.updatedAt || "").localeCompare(
                String(a.updatedAt || ""),
              ),
            ),
        );
      }

      setMessageBody("");
      setOk("Message sent.");
    } catch (e) {
      setErr(e?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ew-page-stack">
      <PageHeader
        title="Messages"
        subtitle="Chat with customers for each quote thread."
        actions={[
          {
            key: "refresh",
            label: "Refresh",
            variant: "secondary",
            onClick: () => {
              loadThreads();
              loadThread(selectedThreadId);
            },
            disabled: threadsLoading || threadLoading || sending,
          },
        ]}
      />

      {err && (
        <Feedback
          onRetry={() =>
            selectedThreadId ? loadThread(selectedThreadId) : loadThreads()
          }
        >
          {err}
        </Feedback>
      )}
      {ok && <Feedback tone="success">{ok}</Feedback>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Threads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search threads"
              aria-label="Search message threads"
            />

            {threadsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : filteredThreads.length === 0 && !err ? (
              <EmptyState
                title="No threads yet"
                description="Create/send a quote and open a thread from quote actions."
              />
            ) : (
              <div className="ew-thread-list">
                {filteredThreads.map((thread) => {
                  const active = selectedThreadId === thread.id;
                  const customerName = customerNameFromThread(thread);
                  return (
                    <button
                      type="button"
                      key={thread.id}
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setOk("");
                        setErr("");
                      }}
                      className="ew-thread-choice"
                      aria-current={active ? "true" : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {customerName}
                          </div>
                          <div className="truncate text-xs text-slate-600">
                            {threadTitle(thread)}
                          </div>
                        </div>
                        {thread.unread ? (
                          <Badge variant="brand">Unread</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {thread.lastMessage?.body || "No messages yet"}
                      </div>
                      <div className="ew-form-help mt-1">
                        {fmtDate(thread.updatedAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedThreadId ? (
              <EmptyState
                title="Select a thread"
                description="Pick a thread from the left to view conversation history."
              />
            ) : threadLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !threadData ? (
              <EmptyState
                title="Thread unavailable"
                description="This thread could not be loaded."
              />
            ) : (
              <>
                <ConversationThread
                  title={customerNameFromThread(
                    selectedThreadRow || threadData,
                  )}
                  subtitle={[
                    selectedThreadRow?.quote?.venueName ||
                      threadData?.thread?.quote?.venueName ||
                      "Quote thread",
                    selectedThreadRow?.quote?.eventDate ||
                      threadData?.thread?.quote?.eventDate,
                    selectedThreadRow?.quote?.eventPostcode ||
                      threadData?.thread?.quote?.eventPostcode,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                  messages={(threadData.messages || []).map((msg) => ({
                    id: msg.id,
                    own: msg.senderType === "supplier",
                    sender:
                      msg.senderType === "supplier" ? "You" : msg.senderType,
                    createdAt: msg.createdAt,
                    when: fmtDate(msg.createdAt),
                    body: msg.body,
                  }))}
                />
                <MessageComposer
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  onSend={sendMessage}
                  sending={sending}
                  disabled={
                    sending ||
                    messageBody.trim().length < 1 ||
                    messageBody.trim().length > 2000
                  }
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
