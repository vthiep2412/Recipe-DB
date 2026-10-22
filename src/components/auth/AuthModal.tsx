import { useEffect, useState } from 'preact/hooks';
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

  // Keyboard escape dismissal
  useEffect(() => {
    if (!authState.showModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        authStore.closeAuthModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authState.showModal]);

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
      <div className="auth-modal-container" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="auth-modal-close-btn"
          onClick={() => authStore.closeAuthModal()}
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <AuthCard
          contextCaption={authState.modalContextCaption}
          onSuccess={() => {
            authStore.closeAuthModal();
          }}
        />
      </div>
    </div>
  );
}
