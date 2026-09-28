import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";

type Props = {
  children: ReactNode;
  /** Changing this value (e.g. the route pathname) clears a caught error automatically. */
  resetKey?: unknown;
};

type State = { error: Error | null };

/** Function component so the fallback can use the `useT()` hook; class components can't. */
function ErrorFallback({ onReset }: { onReset: () => void }) {
  const t = useT();
  return (
    <div className="card empty-state">
      <h1>{t("common.errorBoundary.title")}</h1>
      <p className="muted">{t("common.errorBoundary.body")}</p>
      <p className="page-head-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t("common.errorBoundary.reload")}
        </button>
        <Link to="/app" className="btn btn-secondary" onClick={onReset}>
          {t("common.errorBoundary.goToDashboard")}
        </Link>
      </p>
    </div>
  );
}

/**
 * Catches render/lifecycle errors thrown by its children and shows a friendly fallback instead of
 * blanking the whole app. Pass `resetKey` (e.g. the router `pathname`) so navigating away from the
 * page that crashed automatically clears the error on the next render.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] caught an error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}
