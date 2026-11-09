import { CircleAlert } from 'lucide-react';
import * as React from 'react';
import { logTechnicalError } from '@/utils/logger';

interface Props {
  children: React.ReactNode;
  /** Compact inline fallback instead of the full-page one. */
  inline?: boolean;
  fallback?: React.ReactNode;
  context?: string;
}

interface State {
  error: Error | null;
}

/** Catches render errors. Logs only technical details (never record contents). */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    logTechnicalError(this.props.context ?? 'render', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    if (this.props.inline) {
      return (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <p className="font-semibold">This section could not be displayed.</p>
          <p className="mt-1">{this.state.error.message}</p>
          <button className="mt-2 underline" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg rounded-2xl border bg-card p-6 text-center shadow-[var(--shadow-card)]">
        <CircleAlert className="mx-auto size-8 text-danger" />
        <h1 className="mt-3 text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred while displaying this page. Your saved data is stored locally and has not been deleted.
        </p>
        <p className="mt-3 rounded-lg bg-muted p-2 font-mono text-xs break-words">{this.state.error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => window.location.assign('/')}>
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }
}
