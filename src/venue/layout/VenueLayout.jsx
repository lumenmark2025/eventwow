import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";

export default function VenueLayout({ user, onSignOut, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    const path = String(location.pathname || "").toLowerCase();
    if (path.startsWith("/venue/") && path.includes("/edit")) return setTab("dashboard");
    return setTab("dashboard");
  }, [location.pathname]);

  return (
    <AppShell
      title="Eventwow Venue"
      user={user}
      onSignOut={onSignOut}
      nav={[{ key: "dashboard", label: "My venues" }]}
      activeKey={tab}
      onNavigate={() => navigate("/venue")}
    >
      {children}
    </AppShell>
  );
}

