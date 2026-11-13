import { useState } from 'preact/hooks';
import { AlertCircle, Check, LogOut } from 'lucide-preact';
import { authStore } from '../services/authStore';
import { toast } from 'sonner';

interface Props {
  onNavigate: (path: string) => void;
}

export function ScheduledDeletionPage({ onNavigate }: Props) {
  const [loading, setLoading] = useState(false);
  const authState = authStore.getState();
  const scheduledDateStr = authState.profile?.scheduledDeleteAt;

  const scheduledDate = scheduledDateStr ? new Date(scheduledDateStr) : new Date(Date.now() + 30 * 86400000);
  const remainingDays = Math.max(0, Math.ceil((scheduledDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  const handleCancelDeletion = async () => {
    setLoading(true);
    try {
      const res = await authStore.cancelAccountDeletion();
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success('Account deletion cancelled. Welcome back!');
        onNavigate('/');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel deletion.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await authStore.signOut();
    onNavigate('/');
  };

  return (
    <div className="scheduled-deletion-container">
      <div className="scheduled-deletion-card">
        <div className="scheduled-deletion-icon-wrap">
          <AlertCircle size={32} />
        </div>

        <h1 className="scheduled-deletion-title">Account Scheduled for Deletion</h1>

        <p className="scheduled-deletion-desc">
          Your account is currently queued for permanent deletion on{' '}
          <strong>{scheduledDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
          {remainingDays > 0 ? ` (${remainingDays} days remaining)` : ''}.
        </p>

        <div className="scheduled-deletion-notice">
          During this grace period, your profile and recipes remain preserved. If you cancel deletion, your account access will be restored immediately.
        </div>

        <div className="scheduled-deletion-actions">
          <button
            type="button"
            className="scheduled-deletion-btn btn-recover"
            onClick={handleCancelDeletion}
            disabled={loading}
          >
            <Check size={16} />
            <span>{loading ? 'Restoring Account...' : 'Cancel Deletion & Keep Account'}</span>
          </button>

          <button
            type="button"
            className="scheduled-deletion-btn btn-signout"
            onClick={handleSignOut}
            disabled={loading}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
