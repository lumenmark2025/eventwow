import { useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import { Button, Feedback } from "../../components/workspace/AdminPrimitives";
import {
  DataTable,
  StatusBadge,
} from "../../components/workspace/WorkspaceComponents";

import { SupplierNotificationContext } from "../layout/SupplierNotificationContext";

const DEFAULT_NOTIFICATION_LIMIT = 5;

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function SupplierNotifications() {
  const publishUnreadCount = useContext(SupplierNotificationContext);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rows, setRows] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  async function loadNotifications() {
    setLoading(true);
    setErr("");

    try {
      const resp = await authFetch(
        `/api/supplier-notifications?limit=${DEFAULT_NOTIFICATION_LIMIT}`,
      );
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          json?.details || json?.error || "Failed to load notifications",
        );
      }

      setRows(json?.notifications || []);
      const count = Number(json?.unread_count || 0);
      setUnreadCount(count);
      publishUnreadCount(count);
    } catch (e) {
      const message = String(e?.message || "");
      if (message.toLowerCase().includes("failed to fetch")) {
        setErr(
          "Could not reach the notifications service. Please refresh in a moment.",
        );
      } else {
        setErr(message || "Failed to load notifications");
      }
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
        throw new Error(
          json?.details || json?.error || "Failed to mark notifications",
        );
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
    <div className="ew-page-stack">
      <PageHeader
        title="Notifications"
        subtitle="Recent quote and message updates for your account."
        actions={[
          {
            key: "refresh",
            label: "Refresh",
            variant: "secondary",
            onClick: loadNotifications,
            disabled: loading || marking,
          },
          {
            key: "mark-all",
            label: marking ? "Marking..." : "Mark all read",
            disabled: loading || !!err || marking || unreadCount < 1,
            onClick: () => markRead({ all: true }),
          },
        ]}
      />
      {ok && <Feedback tone="success">{ok}</Feedback>}
      <div className="ew-panel">
        <div className="ew-panel-heading">
          <h2>Inbox</h2>
          <span className="ew-result-count">
            {loading || err ? "—" : unreadCount} unread · latest{" "}
            {DEFAULT_NOTIFICATION_LIMIT}
          </span>
        </div>
        <DataTable
          className="ew-admin-table"
          caption="Supplier notifications"
          rows={rows}
          loading={loading}
          error={err}
          onRetry={loadNotifications}
          emptyTitle="No notifications"
          emptyDescription="You are up to date."
          columns={[
            {
              key: "notification",
              label: "Notification",
              render: (row) => (
                <div>
                  <strong>{row.title}</strong>
                  {row.body && <p>{row.body}</p>}
                </div>
              ),
            },
            {
              key: "created",
              label: "Received",
              render: (row) => fmtDate(row.created_at),
            },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <StatusBadge status={row.read_at ? "Read" : "New"} />
              ),
            },
            {
              key: "action",
              label: "Action",
              render: (row) => (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={marking}
                  onClick={() => openNotification(row)}
                  aria-label={`Open ${row.title}`}
                >
                  Open
                </Button>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
