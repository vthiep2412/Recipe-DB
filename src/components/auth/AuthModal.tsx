import { useEffect, useState, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { AuthCard } from './AuthCard';
import { authStore } from '../../services/authStore';

export interface AuthModalProps {
  onNavigate?: (path: string) => void;
}

export function AuthModal({ onNavigate }: AuthModalProps) {
  const [authState, setAuthState] = useState(authStore.getState());
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const unsubscribe = authStore.subscribe((state) => {
      setAuthState(state);
    });

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Mobile redirect behavior: when modal is triggered on mobile, navigate directly to /auth
  useEffect(() => {
    if (authState.showModal && isMobile) {
      authStore.closeAuthModal();
      if (onNavigate) {
        onNavigate('/auth');
      } else {
        window.history.pushState({}, '', '/auth');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }, [authState.showModal, isMobile, onNavigate]);

  // Focus trap, focus restoration, and Escape dismissal
  useEffect(() => {
    if (!authState.showModal || isMobile) return;

    if (typeof document !== 'undefined') {
      prevFocusedRef.current = document.activeElement as HTMLElement | null;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        authStore.closeAuthModal();
        return;
      }

      if (e.key === 'Tab' && containerRef.current) {
        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => {
          return !el.closest('[inert]') && el.offsetParent !== null;
        });

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      if (containerRef.current) {
        const firstFocusable = containerRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([inert]), button:not([disabled]):not([inert])'
        );
        firstFocusable?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      prevFocusedRef.current?.focus?.();
    };
  }, [authState.showModal, isMobile]);

  if (!authState.showModal || isMobile) {
    return null;
  }

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      authStore.closeAuthModal();
    }
  };

  return (
    <div
      className="auth-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Authentication modal"
    >
      <div
        ref={containerRef}
        className="auth-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="auth-modal-close-btn"
          onClick={() => authStore.closeAuthModal()}
          aria-label="Close authentication modal"
          title="Close authentication modal"
        >
          <X size={18} />
        </button>
        <AuthCard
          key={authState.modalInitialView ?? 'login'}
          initialView={authState.modalInitialView ?? 'login'}
          contextCaption={authState.modalContextCaption}
          onSuccess={() => {
            authStore.closeAuthModal();
          }}
        />
      </div>
    </div>
  );
}
