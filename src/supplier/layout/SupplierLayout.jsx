import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import { supabase } from "../../lib/supabase";

const supplierNav = [
  {
    key: "dashboard",
    label: "Overview",
    to: "/supplier/dashboard",
    group: "Workspace",
  },
  {
    key: "enquiries",
    label: "Requests",
    to: "/supplier/enquiries",
    group: "Work",
  },
  { key: "quotes", label: "Quotes", to: "/supplier/quotes", group: "Work" },
  {
    key: "bookings",
    label: "Bookings",
    to: "/supplier/bookings",
    group: "Work",
  },
  {
    key: "messages",
    label: "Messages",
    to: "/supplier/messages",
    group: "Communication",
  },
  {
    key: "notifications",
    label: "Notifications",
    to: "/supplier/notifications",
    group: "Communication",
  },
  {
    key: "listing",
    label: "Listing / profile",
    to: "/supplier/listing",
    group: "Business",
  },
];

export default function SupplierLayout({
  user,
  supplier,
  onSignOut,
  children,
}) {
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const location = useLocation();
  const navigate = useNavigate();

  async function refreshUnreadCount() {
    try {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
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
      presentation
      onSignOut={onSignOut}
      nav={supplierNav}
      notificationUnreadCount={notificationUnreadCount}
      onNotificationsClick={() => navigate("/supplier/notifications")}
    >
      {children}
    </AppShell>
  );
}
