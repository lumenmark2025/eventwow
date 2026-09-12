import WorkspaceShell from "../../components/workspace/WorkspaceShell";
import { adminNavItems } from "./adminNavItems";

export default function AdminLayout({ user, onSignOut, children }) {
  return <WorkspaceShell title="Admin console" user={user} onSignOut={onSignOut} nav={adminNavItems} presentation>{children}</WorkspaceShell>;
}
