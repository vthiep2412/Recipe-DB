import { Component, ComponentChildren } from 'preact';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-preact';

export interface ErrorReport {
  correlationId: string;
  timestamp: string;
  errorName: string;
  message: string;
  componentStack?: string;
  url?: string;
}

function generateCorrelationId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ERR-${ts}-${rand}`;
}

interface ErrorBoundaryProps {
  children: ComponentChildren;
  fallback?: ComponentChildren;
  onCatch?: (report: ErrorReport) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  correlationId: string | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      correlationId: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const correlationId = generateCorrelationId();
    this.setState({ correlationId });

    const report: ErrorReport = {
      correlationId,
      timestamp: new Date().toISOString(),
      errorName: error.name || 'Error',
      message: error.message || 'Unknown error occurred',
      componentStack: errorInfo?.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    };

    console.error(`[ErrorBoundary] Incident ${correlationId}:`, error, errorInfo);

    this.props.onCatch?.(report);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, correlationId: null, copied: false });
  };

  handleCopyCorrelationId = () => {
    if (!this.state.correlationId || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(this.state.correlationId).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { correlationId, copied, error } = this.state;
      const isDev = Boolean(import.meta.env?.DEV);

      return (
        <div
          className="page-container"
          style={{
            maxWidth: '38rem',
            margin: '4rem auto',
            padding: '2rem',
            textAlign: 'center',
            background: 'var(--background-secondary, #1e1e1e)',
            borderRadius: 'var(--radius-lg, 12px)',
            border: '1px solid var(--background-modifier-border, #333)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          }}
          role="alert"
        >
          <div
            style={{
              width: '3.5rem',
              height: '3.5rem',
              margin: '0 auto 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--color-red, #ef4444)',
            }}
          >
            <AlertTriangle size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-normal)' }}>
            Something went wrong
          </h2>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.6', marginBottom: '1.25rem' }}>
            An unexpected error occurred while rendering this view. You can reload the application or try returning to the previous screen.
          </p>

          {correlationId && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--background-primary, #121212)',
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--background-modifier-border, #282828)',
                marginBottom: '1.5rem',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Incident Reference:</span>
              <code style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-normal)' }}>
                {correlationId}
              </code>
              <button
                type="button"
                onClick={this.handleCopyCorrelationId}
                title="Copy Incident Reference"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {copied ? <Check size={14} color="var(--color-green, #10b981)" /> : <Copy size={14} />}
              </button>
            </div>
          )}

          {isDev && error && (
            <details
              style={{
                textAlign: 'left',
                background: 'var(--background-primary, #121212)',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-muted)',
                marginBottom: '1.75rem',
                overflowX: 'auto',
                border: '1px solid var(--background-modifier-border, #282828)',
              }}
            >
              <summary style={{ cursor: 'pointer', marginBottom: '0.5rem', color: 'var(--text-normal)' }}>
                Diagnostic Details (Dev Only)
              </summary>
              <div>{error.message}</div>
            </details>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="tag-chip"
              style={{ padding: '0.55rem 1.15rem', fontSize: '0.875rem', cursor: 'pointer' }}
              onClick={this.handleReset}
            >
              Try Again
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.15rem',
                fontSize: '0.875rem',
                borderRadius: 'var(--radius-md, 8px)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
              onClick={this.handleReload}
            >
              <RefreshCw size={14} />
              <span>Reload App</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
