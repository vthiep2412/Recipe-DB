import { useState, useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AppSettingsModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'tab1' | 'tab2'>('tab1');
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const modalEl = modalRef.current;
    if (modalEl) {
      const focusables = modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        modalEl.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalEl) {
        const focusables = Array.from(
          modalEl.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalEl.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="app-settings-title" className="modal-title">App Settings</h2>
          <button type="button" className="nav-btn" onClick={onClose} aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-sidebar">
            <button
              className={`modal-tab-btn ${activeTab === 'tab1' ? 'active' : ''}`}
              onClick={() => setActiveTab('tab1')}
            >
              Dummy Tab 1
            </button>
            <button
              className={`modal-tab-btn ${activeTab === 'tab2' ? 'active' : ''}`}
              onClick={() => setActiveTab('tab2')}
            >
              Dummy Tab 2
            </button>
          </div>

          <div className="modal-content-panel">
            {activeTab === 'tab1' ? (
              <div>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.125rem' }}>Dummy Tab 1 Content</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: '1.6' }}>
                  This is placeholder configuration content for dummy tab 1. You can configure general recipe database preferences and custom unit conversions here in the future.
                </p>
              </div>
            ) : (
              <div>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.125rem' }}>Dummy Tab 2 Content</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: '1.6' }}>
                  This is placeholder configuration content for dummy tab 2. Advanced sync settings and database integrations can be hooked up here later.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
