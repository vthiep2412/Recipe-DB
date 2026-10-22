import { useEffect } from 'preact/hooks';
import { X } from 'lucide-preact';
import { AuthCard } from './AuthCard';
import { isAuthModalOpen, closeAuthModal } from '../../services/authStore';

export function AuthModal() {
  const isOpen = isAuthModalOpen.value;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    closeAuthModal();
    window.location.href = '/auth';
    return null;
  }

  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      closeAuthModal();
    }
  };

  return (
    <div class="modal-overlay" onClick={handleBackdropClick}>
      <div style={{ position: 'relative', maxWidth: '900px', width: '100%' }}>
        <button
          type="button"
          class="modal-close-btn"
          onClick={closeAuthModal}
          title="Close overlay"
        >
          <X size={24} />
        </button>
        <div class="device-pc-wrapper">
          <AuthCard onSuccess={closeAuthModal} />
        </div>
      </div>
    </div>
  );
}
