import { ShieldAlert, LifeBuoy, LogOut } from 'lucide-preact';
import { authStore } from '../../services/authStore';

interface Props {
  onNavigate: (path: string) => void;
}

export function AccountSuspendedModal({ onNavigate }: Props) {
  const handleContactSupport = () => {
    onNavigate('/support');
  };

  const handleSignOut = async () => {
    await authStore.signOut();
    onNavigate('/');
  };

  return (
    <div
      className="scheduled-deletion-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-suspended-title"
    >
      <div className="scheduled-deletion-card">
        <div className="scheduled-deletion-icon-wrap" aria-hidden="true">
          <ShieldAlert size={32} />
        </div>

        <h1 id="account-suspended-title" className="scheduled-deletion-title">
          Account Suspended by Administrator
        </h1>

        <p className="scheduled-deletion-desc">
          Your account access has been suspended. Please contact support to submit an appeal.
        </p>

        <div className="scheduled-deletion-notice">
          <strong>Notice:</strong> All creator, editing, and interactive capabilities have
          been restricted. If you believe this action was taken in error, contact support
          with your registered username and email.
        </div>

        <div className="scheduled-deletion-actions">
          <button
            type="button"
            className="scheduled-deletion-btn btn-recover"
            onClick={handleContactSupport}
          >
            <LifeBuoy size={16} />
            <span>Contact Support</span>
          </button>

          <button
            type="button"
            className="scheduled-deletion-btn btn-signout"
            onClick={handleSignOut}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
