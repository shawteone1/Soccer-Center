/**
 * FanSectionErrorBoundary — section-level error boundary for Fan Arena tabs.
 *
 * Catches render errors in a single tab/section so a content failure does not
 * strand the entire portal. Shows a minimal inline error card with a retry
 * button that resets the boundary state.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error card (e.g. "My Feed") */
  section?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class FanSectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FanArena] Section render error:', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    const section = this.props.section ?? 'This section';

    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
        <AlertTriangle size={28} className="text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">{section} couldn't load</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            A rendering error occurred. Your data is safe — try refreshing this section.
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-[10px] text-destructive mt-2 font-mono break-all max-w-xs">
              {this.state.message}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border border-border bg-muted text-foreground hover:bg-muted/80 transition-colors"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </div>
    );
  }
}
