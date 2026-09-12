import { LayoutDashboard, Inbox } from "lucide-react";
import AppShell from "../../components/layout/AppShell";

const customerNav = [
  {
    key: "dashboard",
    label: "Overview",
    to: "/customer",
    end: true,
    icon: LayoutDashboard,
    group: "Workspace",
  },
  {
    key: "enquiries",
    label: "My enquiries",
    to: "/customer/enquiries",
    icon: Inbox,
    group: "Your events",
  },
];

export default function CustomerLayout({ user, onSignOut, children }) {
  return (
    <AppShell
      title="Eventwow Customer"
      user={user}
      onSignOut={onSignOut}
      nav={customerNav}
      presentation
    >
      {children}
    </AppShell>
  );
}
