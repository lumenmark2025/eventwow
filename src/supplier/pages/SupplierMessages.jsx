import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import PageHeader from "../../components/layout/PageHeader";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
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
  const eventDate = thread?.quote?.eventDate ? ` - ${thread.quote.eventDate}` : "";
  return `${venue}${eventDate}`;
}

function messageBadgeVariant(senderType) {
  if (senderType === "supplier") return "brand";
  if (senderType === "customer") return "neutral";
  return "warning";
}

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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
  const [selectedThreadId, setSelectedThreadId] = useState(initialThreadId || "");
  const [threadData, setThreadData] = useState(null);
  const [messageBody, setMessageBody] = useState("");
  const [search, setSearch] = useState("");

  async function loadThreads() {
    if (!supplierId) return;

    setThreadsLoading(true);
    setErr("");

    try {
      const resp = await authFetch("/api/supplier-threads");
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.details || json?.error || "Failed to load threads");
      }

      const rows = json?.threads || [];
      setThreads(rows);

      const preferred = selectedThreadId || initialThreadId;
      if (preferred) {
        const exists = rows.some((x) => x.id === preferred);
        if (exists) {
          setSelectedThreadId(preferred);
          await loadThread(preferred);
        }
      }
    } catch (e) {
      setErr(e?.message || "Failed to load threads");
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadThread(threadId) {
    if (!threadId) return;

    setThreadLoading(true);
    setErr("");

    try {
      const resp = await authFetch(`/api/supplier-thread?threadId=${encodeURIComponent(threadId)}`);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.details || json?.error || "Failed to load thread");
      }

      setThreadData({ thread: json.thread, messages: json.messages || [] });
      setThreads((prev) => prev.map((row) => (row.id === threadId ? { ...row, unread: false, lastReadAt: new Date().toISOString() } : row)));
    } catch (e) {
      setThreadData(null);
      setErr(e?.message || "Failed to load thread");
    } finally {
      setThreadLoading(false);
    }
  }

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  useEffect(() => {
    if (!selectedThreadId) return;
    if (threadData?.thread?.id === selectedThreadId) return;
    loadThread(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;

    return threads.filter((t) => {
      const haystack = [
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
      const clientMessageId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;

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
        throw new Error(json?.details || json?.error || "Failed to send message");
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
                      body: body.length > 120 ? `${body.slice(0, 117)}...` : body,
                      senderType: "supplier",
                      createdAt: nowIso,
                    },
                  }
                : row
            )
            .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
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
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        subtitle="Chat with customers for each quote thread."
        actions={[{ key: "refresh", label: "Refresh", variant: "secondary", onClick: loadThreads }]}
      />

      {err ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
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
            ) : filteredThreads.length === 0 ? (
              <EmptyState title="No threads yet" description="Create/send a quote and open a thread from quote actions." />
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-auto">
                {filteredThreads.map((thread) => {
                  const active = selectedThreadId === thread.id;
                  return (
                    <button
                      type="button"
                      key={thread.id}
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setOk("");
                        setErr("");
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-shadow hover:shadow-sm ${active ? "border-brand" : "border-slate-200"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-900">{threadTitle(thread)}</div>
                        {thread.unread ? <Badge variant="brand">Unread</Badge> : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {thread.lastMessage?.body || "No messages yet"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{fmtDate(thread.updatedAt)}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedThreadId ? (
              <EmptyState title="Select a thread" description="Pick a thread from the left to view conversation history." />
            ) : threadLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !threadData ? (
              <EmptyState title="Thread unavailable" description="This thread could not be loaded." />
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {selectedThreadRow?.quote?.venueName || "Quote thread"}
                  {selectedThreadRow?.quote?.eventDate ? ` - ${selectedThreadRow.quote.eventDate}` : ""}
                  {selectedThreadRow?.quote?.eventPostcode ? ` - ${selectedThreadRow.quote.eventPostcode}` : ""}
                </div>

                <div className="max-h-[420px] space-y-2 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
                  {(threadData.messages || []).length === 0 ? (
                    <EmptyState title="No messages yet" description="Start the conversation by sending a message." />
                  ) : (
                    threadData.messages.map((msg) => (
                      <div key={msg.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant={messageBadgeVariant(msg.senderType)}>
                            {msg.senderType === "supplier" ? "You" : msg.senderType}
                          </Badge>
                          <span className="text-xs text-slate-500">{fmtDate(msg.createdAt)}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-slate-800">{msg.body}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <textarea
                    className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                    placeholder="Type your message..."
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    maxLength={2000}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">{messageBody.trim().length}/2000</div>
                    <Button
                      type="button"
                      onClick={sendMessage}
                      disabled={sending || messageBody.trim().length < 1 || messageBody.trim().length > 2000}
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
    </div>
  );
}
