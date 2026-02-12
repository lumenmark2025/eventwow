import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import Badge from "../../components/ui/Badge";
import { Card, CardContent } from "../../components/ui/Card";

export default function AdminLayout({ user, onSignOut, children }) {
  const [tab, setTab] = useState("venues");

  const location = useLocation();
  const navigate = useNavigate();

  // Keep active tab in sync with URL (for button highlight only)
  useEffect(() => {
    const path = (location.pathname || "").toLowerCase();

    if (path.startsWith("/admin/suppliers")) return setTab("suppliers");
    if (path.startsWith("/admin/enquiries")) return setTab("enquiries");
    if (path.startsWith("/admin/venues")) return setTab("venues");

    // default highlight
    if (path === "/" || path === "/admin" || path === "/admin/") setTab("venues");
  }, [location.pathname]);

  function go(nextTab) {
    if (nextTab === "venues") navigate("/admin/venues");
    if (nextTab === "suppliers") navigate("/admin/suppliers");
    if (nextTab === "enquiries") navigate("/admin/enquiries");
  }

  return (
    <AppShell
      title="Eventwow Admin"
      user={user}
      onSignOut={onSignOut}
      nav={[
        { key: "venues", label: "Venues" },
        { key: "suppliers", label: "Suppliers" },
        { key: "enquiries", label: "Enquiries" },
      ]}
      activeKey={tab}
      onNavigate={go}
    >
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Admin Control Panel</p>
              <p className="text-sm text-slate-600">Signed in as {user.email}</p>
            </div>
            <Badge variant="brand">Admin</Badge>
          </CardContent>
        </Card>
        <div>{children}</div>
      </div>
    </AppShell>
  );
}
