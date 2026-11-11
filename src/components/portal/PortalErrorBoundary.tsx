/**
 * Route-level error boundary for portal pages.
 * Shown when a loader throws or the page component crashes.
 * Provides retry and a safe Return to Parent Portal action.
 */
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function PortalErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Something went wrong';
  let detail = 'An unexpected error occurred. Please try again.';
  let status: number | null = null;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = 'Page not found';
      detail = 'This page does not exist or has been moved.';
    } else if (error.status === 403) {
      title = 'Access denied';
      detail = 'You do not have permission to view this page.';
    } else if (error.status === 401) {
      title = 'Sign in required';
      detail = 'Please sign in to access this page.';
    } else {
      detail = error.data?.message ?? `Server error (${error.status})`;
    }
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-16 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'hsl(var(--destructive) / 0.12)' }}
      >
        <AlertTriangle size={26} style={{ color: 'hsl(var(--destructive))' }} />
      </div>

      {status && (
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>
          Error {status}
        </p>
      )}

      <h1
        className="text-xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--pp-text))' }}
      >
        {title}
      </h1>
      <p className="text-sm max-w-sm mb-8" style={{ color: 'hsl(var(--pp-text-muted))' }}>
        {detail}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold border transition-colors"
          style={{
            borderColor: 'hsl(var(--pp-border))',
            color: 'hsl(var(--pp-text))',
            background: 'hsl(var(--pp-surface))',
          }}
        >
          <RefreshCw size={14} />
          Try again
        </button>

        <button
          type="button"
          onClick={() => navigate('/parent-portal')}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'hsl(var(--pp-navy))' }}
        >
          <Home size={14} />
          Return to Parent Portal
        </button>
      </div>
    </div>
  );
}
