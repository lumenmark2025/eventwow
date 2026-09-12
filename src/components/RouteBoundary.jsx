import { Component } from "react";
import AuthShell from "./auth/AuthShell";
import Button from "./ui/Button";

export function RouteLoading() {
  return (
    <AuthShell title="Loading page…">
      <p role="status" className="auth-body">
        Loading page…
      </p>
    </AuthShell>
  );
}

export default class RouteBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <AuthShell title="This page could not load">
          <p role="alert" className="auth-error">
            Please reload to try again.
          </p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </AuthShell>
      );
    return this.props.children;
  }
}
