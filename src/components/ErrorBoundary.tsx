import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in place of `children` once an error has been caught. */
  message: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors from its subtree. Needed around `lazy()` boundaries:
 * a failed dynamic import (stale chunk after a deploy, offline tab) is thrown
 * during render and would otherwise blank the whole page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, info.componentStack);
  }

  // A full reload rather than a state reset: `lazy()` caches the rejected import
  // promise, so re-rendering the same boundary just re-throws it. Inputs survive
  // because they are serialized into the URL hash.
  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="bg-bg-card border border-border rounded-lg px-4 py-6 text-sm text-text-secondary">
        <p className="mb-3">{this.props.message}</p>
        <button
          onClick={this.reload}
          className="px-3 py-1.5 rounded-md border border-border text-text-primary hover:bg-bg-secondary transition-colors"
        >
          Reload page
        </button>
      </div>
    );
  }
}
