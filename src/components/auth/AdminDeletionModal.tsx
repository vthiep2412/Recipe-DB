import { AlertTriangle, LifeBuoy, LogOut } from 'lucide-preact';
import { authStore } from '../../services/authStore';

interface Props {
  onNavigate: (path: string) => void;
}

export function AdminDeletionModal({ onNavigate }: Props) {
  const authState = authStore.getState();
  const scheduledDateStr = authState.profile?.scheduledDeleteAt;

  const scheduledDate = scheduledDateStr
    ? new Date(scheduledDateStr)
    : new Date(Date.now() + 30 * 86400000);

  const diffMs = scheduledDate.getTime() - Date.now();
  const remainingHoursTotal = Math.max(0, Math.ceil(diffMs / (60 * 60 * 1000)));
  const remainingDays = Math.floor(remainingHoursTotal / 24);
  const remainingHours = remainingHoursTotal % 24;

  const remainingText =
    remainingDays > 0
      ? `${remainingDays} day${remainingDays === 1 ? '' : 's'}${remainingHours > 0 ? `, ${remainingHours} hour${remainingHours === 1 ? '' : 's'}` : ''}`
      : `${remainingHoursTotal} hour${remainingHoursTotal === 1 ? '' : 's'}`;

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
      aria-labelledby="admin-deletion-title"
    >
      <div className="scheduled-deletion-card">
        <div className="scheduled-deletion-icon-wrap" aria-hidden="true">
          <AlertTriangle size={32} />
        </div>

        <h1 id="admin-deletion-title" className="scheduled-deletion-title">
          Account in Deletion Grace Period
        </h1>

        <p className="scheduled-deletion-desc">
          Your account was scheduled for deletion by an administrator. Contact
          support with <strong>{remainingText} remaining</strong> before your
          account is permanently purged.
        </p>

        <div className="scheduled-deletion-notice">
          <strong>Notice:</strong> Accounts queued for deletion by administration
          cannot be self-restored. During this grace period, your data remains
          preserved in read-only status. Please contact support immediately to
          submit an appeal.
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
