import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function SupplierNotifications() {
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rows, setRows] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  async function loadNotifications() {
    setLoading(true);
    setErr("");

    try {
      const resp = await authFetch("/api/supplier-notifications");
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.details || json?.error || "Failed to load notifications");
      }

      setRows(json?.notifications || []);
      setUnreadCount(Number(json?.unread_count || 0));
    } catch (e) {
      setErr(e?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(payload) {
    setMarking(true);
    setErr("");
    setOk("");

    try {
      const resp = await authFetch("/api/supplier-notifications-mark-read", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.details || json?.error || "Failed to mark notifications");
      }

      setOk("Marked as read.");
      await loadNotifications();
    } catch (e) {
      setErr(e?.message || "Failed to mark notifications");
    } finally {
      setMarking(false);
    }
  }

  function openNotification(row) {
    if (!row?.id) return;

    const proceed = async () => {
      if (!row.read_at) {
        await markRead({ notificationIds: [row.id] });
      }
      if (row.url) {
        window.location.assign(row.url);
      }
    };

    proceed();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Recent quote and message updates for your account."
        actions={[
          { key: "refresh", label: "Refresh", variant: "secondary", onClick: loadNotifications },
          { key: "mark-all", label: marking ? "Marking..." : "Mark all read", disabled: marking || unreadCount < 1, onClick: () => markRead({ all: true }) },
        ]}
      />

      {err ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Inbox {unreadCount > 0 ? <Badge variant="brand" className="ml-2">{unreadCount} unread</Badge> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No notifications" description="You are up to date." />
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openNotification(row)}
                className={`w-full rounded-xl border p-3 text-left transition-shadow hover:shadow-sm ${row.read_at ? "border-slate-200 bg-white" : "border-brand/40 bg-teal-50/40"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{row.title}</div>
                  {!row.read_at ? <Badge variant="brand">Unread</Badge> : <Badge variant="neutral">Read</Badge>}
                </div>
                {row.body ? <div className="mt-1 text-sm text-slate-700">{row.body}</div> : null}
                <div className="mt-1 text-xs text-slate-500">{fmtDate(row.created_at)}</div>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
