import { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: ComponentChildren;
  confirmLabel?: string;
  cancelLabel?: string;
  discardLabel?: string;
  onDiscard?: () => void;
  confirmVariant?: 'primary' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  discardLabel,
  onDiscard,
  confirmVariant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);
  const titleIdRef = useRef(`confirm-modal-title-${Math.random().toString(36).slice(2, 9)}`);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (!isOpen) {
      if (prevFocusedRef.current) {
        prevFocusedRef.current.focus?.();
        prevFocusedRef.current = null;
      }
      return;
    }

    if (typeof document !== 'undefined') {
      prevFocusedRef.current = document.activeElement as HTMLElement | null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoadingRef.current) {
        e.preventDefault();
        onCancelRef.current();
        return;
      }

      if (e.key === 'Tab' && cardRef.current) {
        const focusables = Array.from(
          cardRef.current.querySelectorAll<HTMLElement>(
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
          if (document.activeElement === first || !cardRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !cardRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (prevFocusedRef.current) {
        prevFocusedRef.current.focus?.();
        prevFocusedRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const content = (
    <div
      className="confirm-modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <div
        ref={cardRef}
        className="confirm-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleIdRef.current}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleIdRef.current} className="confirm-modal-title">
          {title}
        </h3>

        <div className="confirm-modal-body">
          {message}
        </div>

        <div className="confirm-modal-actions">
          {discardLabel && onDiscard && (
            <button
              type="button"
              className="confirm-modal-btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={(e) => {
                e.stopPropagation();
                onDiscard();
              }}
              disabled={isLoading}
            >
              {discardLabel}
            </button>
          )}
          <button
            type="button"
            className="confirm-modal-btn btn-cancel"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            className={`confirm-modal-btn btn-${confirmVariant}`}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : content;
}
