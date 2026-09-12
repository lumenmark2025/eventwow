import WorkspaceShell from "../workspace/WorkspaceShell";

// Preserve the role layouts' callback API while sharing one workspace geometry.
// Legacy navTheme/showBrandMeta are intentionally superseded by the canonical shell.
export default function AppShell({ title = "Workspace", ...props }) {
  return <WorkspaceShell title={title.replace(/^Eventwow\s*/i, "")} {...props} />;
}
