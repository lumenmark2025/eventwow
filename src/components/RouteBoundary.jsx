import { Component } from "react";

export default class RouteBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert" className="mx-auto max-w-lg space-y-4 p-8">
          <h1 className="text-xl font-semibold">This page could not load</h1>
          <p>Please reload to try again.</p>
          <button
            className="rounded-lg border bg-white px-4 py-2"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    return this.props.children;
  }
}
