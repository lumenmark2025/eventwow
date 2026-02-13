import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { supabase } from "../../lib/supabase";

export default function SupplierLayout({ user, supplier, onSignOut, children }) {
  const [tab, setTab] = useState("dashboard");
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = (location.pathname || "").toLowerCase();

    if (path.startsWith("/supplier/enquiries")) return setTab("enquiries");
    if (path.startsWith("/supplier/quotes")) return setTab("quotes");
    if (path.startsWith("/supplier/messages")) return setTab("messages");
    if (path.startsWith("/supplier/listing")) return setTab("listing");
    if (path.startsWith("/supplier/notifications")) return setTab("notifications");
    if (path.startsWith("/supplier/bookings")) return setTab("bookings");
    if (path.startsWith("/supplier/dashboard")) return setTab("dashboard");

    if (path === "/supplier" || path === "/supplier/") setTab("dashboard");
  }, [location.pathname]);

  const nav = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "enquiries", label: "Requests" },
      { key: "quotes", label: "Quotes" },
      { key: "listing", label: "Listing" },
      { key: "messages", label: "Messages" },
      { key: "notifications", label: "Notifications" },
      { key: "bookings", label: "Bookings" },
    ],
    []
  );

  const go = (nextTab) => {
    if (nextTab === "dashboard") navigate("/supplier/dashboard");
    if (nextTab === "enquiries") navigate("/supplier/enquiries");
    if (nextTab === "quotes") navigate("/supplier/quotes");
    if (nextTab === "listing") navigate("/supplier/listing");
    if (nextTab === "messages") navigate("/supplier/messages");
    if (nextTab === "notifications") navigate("/supplier/notifications");
    if (nextTab === "bookings") navigate("/supplier/bookings");
  };

  async function refreshUnreadCount() {
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) return;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      const resp = await fetch("/api/supplier-notifications?limit=1", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return;
      setNotificationUnreadCount(Number(json?.unread_count || 0));
    } catch {
      // ignore unread refresh errors
    }
  }

  useEffect(() => {
    refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  return (
    <AppShell
      title="Eventwow Supplier"
      user={user}
      supplier={supplier}
      onSignOut={onSignOut}
      nav={nav}
      activeKey={tab}
      onNavigate={go}
      notificationUnreadCount={notificationUnreadCount}
      onNotificationsClick={() => navigate("/supplier/notifications")}
    >
      {children}
    </AppShell>
  );
}
