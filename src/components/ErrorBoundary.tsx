import { Component, ComponentChildren } from 'preact';
import { AlertTriangle, RefreshCw } from 'lucide-preact';

interface ErrorBoundaryProps {
  children: ComponentChildren;
  fallback?: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Unhandled UI Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

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

          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
            An unexpected error occurred while rendering this view. You can reload the application or try returning to the previous screen.
          </p>

          {this.state.error && (
            <div
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
              {this.state.error.message}
            </div>
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
