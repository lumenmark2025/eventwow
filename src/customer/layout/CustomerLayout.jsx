import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";

export default function CustomerLayout({ user, onSignOut, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    const path = (location.pathname || "").toLowerCase();
    if (path.startsWith("/customer/enquiries")) return setTab("enquiries");
    return setTab("dashboard");
  }, [location.pathname]);

  const nav = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "enquiries", label: "My enquiries" },
    ],
    []
  );

  function go(nextTab) {
    if (nextTab === "dashboard") navigate("/customer");
    if (nextTab === "enquiries") navigate("/customer/enquiries");
  }

  return (
    <AppShell
      title="Eventwow Customer"
      user={user}
      onSignOut={onSignOut}
      nav={nav}
      activeKey={tab}
      onNavigate={go}
    >
      {children}
    </AppShell>
  );
}
