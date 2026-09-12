import { Building2 } from "lucide-react";
import AppShell from "../../components/layout/AppShell";

const venueNav = [
  {
    key: "dashboard",
    label: "My venues",
    to: "/venue",
    icon: Building2,
    group: "Workspace",
  },
];

export default function VenueLayout({ user, onSignOut, children }) {
  return (
    <AppShell
      title="Eventwow Venue"
      user={user}
      onSignOut={onSignOut}
      nav={venueNav}
      presentation
    >
      {children}
    </AppShell>
  );
}
