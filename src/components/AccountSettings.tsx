import { useState, useEffect } from 'preact/hooks';
import {
  User,
  Key,
  LogOut,
  Trash2,
  Check,
  X,
  Pencil,
  CircleUser,
  AlertCircle,
  ShieldAlert,
} from 'lucide-preact';
import { authStore } from '../services/authStore';
import { Tooltip } from './Tooltip';
import { ConfirmModal } from './ConfirmModal';
import { toast } from 'sonner';

export interface AccountSettingsProps {
  onNavigate: (path: string) => void;
}

export function AccountSettings({ onNavigate }: AccountSettingsProps) {
  const [authState, setAuthState] = useState(authStore.getState());

  // Identity Form & Inline Edit State
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [inlineEditing, setInlineEditing] = useState<'none' | 'displayName' | 'username'>('none');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [identityLoading, setIdentityLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    type: 'displayName' | 'username';
    pendingValue: string;
  } | null>(null);

  // Credentials State
  const [newEmail, setNewEmail] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Danger Zone
  const [dangerLoading, setDangerLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = authStore.subscribe((state) => {
      setAuthState(state);
      if (!state.user && !state.isAuthLoading) {
        onNavigate('/auth');
      } else if (state.profile) {
        setDisplayName(state.profile.displayName);
        setUsername(state.profile.username);
      }
      if (state.user) {
        setNewEmail(state.user.email);
      }
    });

    const current = authStore.getState();
    if (!current.user && !current.isAuthLoading) {
      onNavigate('/auth');
    } else if (current.profile) {
      setDisplayName(current.profile.displayName);
      setUsername(current.profile.username);
    }
    if (current.user) {
      setNewEmail(current.user.email);
    }

    return () => unsubscribe();
  }, [onNavigate]);

  // Cooldown calculations
  const now = Date.now();
  const usernameCooldownMs = 30 * 24 * 60 * 60 * 1000;
  const usernameLastChanged = authState.profile?.usernameLastChangedAt
    ? new Date(authState.profile.usernameLastChangedAt).getTime()
    : 0;
  const usernameElapsed = Math.max(0, now - usernameLastChanged);
  const isUsernameOnCooldown = usernameLastChanged > 0 && usernameElapsed < usernameCooldownMs;
  const usernameRemainingMs = Math.max(0, usernameCooldownMs - usernameElapsed);
  const usernameRemainingDays = Math.min(30, Math.ceil(usernameRemainingMs / (24 * 60 * 60 * 1000)));
  const usernameRemainingHours = Math.min(720, Math.ceil(usernameRemainingMs / (60 * 60 * 1000)));

  const displayNameCooldownMs = 24 * 60 * 60 * 1000;
  const displayNameLastChanged = authState.profile?.displayNameLastChangedAt
    ? new Date(authState.profile.displayNameLastChangedAt).getTime()
    : 0;
  const displayNameElapsed = Math.max(0, now - displayNameLastChanged);
  const isDisplayNameOnCooldown = displayNameLastChanged > 0 && displayNameElapsed < displayNameCooldownMs;
  const displayNameRemainingMs = Math.max(0, displayNameCooldownMs - displayNameElapsed);
  const displayNameRemainingHours = Math.min(24, Math.ceil(displayNameRemainingMs / (60 * 60 * 1000)));
  const displayNameRemainingMinutes = Math.min(1440, Math.ceil(displayNameRemainingMs / (60 * 1000)));

  const displayNameCooldownText = isDisplayNameOnCooldown
    ? `Display name can be changed once every 24 hours (${
        displayNameRemainingHours > 1
          ? `${displayNameRemainingHours}h remaining`
          : `${displayNameRemainingMinutes}m remaining`
      })`
    : 'Display name can be updated once every 24 hours';

  const usernameCooldownText = isUsernameOnCooldown
    ? `Username can be changed once every 30 days (${
        usernameRemainingDays > 1
          ? `${usernameRemainingDays} days remaining`
          : `${usernameRemainingHours}h remaining`
      })`
    : 'Username can be updated once every 30 days';

  // Inline Display Name Handlers
  const startEditDisplayName = () => {
    if (isDisplayNameOnCooldown) return;
    setEditDisplayName(displayName);
    setInlineEditing('displayName');
  };

  const cancelInlineEdit = () => {
    setInlineEditing('none');
  };

  const requestConfirmDisplayName = () => {
    const trimmed = editDisplayName.trim();
    if (!trimmed) return;
    if (trimmed === displayName) {
      setInlineEditing('none');
      return;
    }
    setConfirmModal({
      type: 'displayName',
      pendingValue: trimmed,
    });
  };

  // Inline Username Handlers
  const startEditUsername = () => {
    if (isUsernameOnCooldown) return;
    setEditUsername(username);
    setInlineEditing('username');
  };

  const requestConfirmUsername = () => {
    const clean = editUsername.trim().replace(/^@/, '');
    if (!clean) return;
    if (clean === username) {
      setInlineEditing('none');
      return;
    }
    setConfirmModal({
      type: 'username',
      pendingValue: clean,
    });
  };

  const handleConfirmModalSave = async () => {
    if (!confirmModal) return;
    setIdentityLoading(true);

    try {
      if (confirmModal.type === 'displayName') {
        const res = await authStore.updateDisplayName(confirmModal.pendingValue);
        if (res?.error) {
          toast.error(res.error);
        } else {
          setDisplayName(confirmModal.pendingValue);
          toast.success('Display name updated.');
          setInlineEditing('none');
          setConfirmModal(null);
        }
      } else {
        const res = await authStore.updateUsername(confirmModal.pendingValue);
        if (res?.error) {
          toast.error(res.error);
        } else {
          setUsername(confirmModal.pendingValue);
          toast.success('Username updated.');
          setInlineEditing('none');
          setConfirmModal(null);
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setIdentityLoading(false);
    }
  };

  // Credentials Handlers
  const handleUpdateEmail = async (e: Event) => {
    e.preventDefault();
    const emailToUpdate = newEmail.trim();
    if (!emailToUpdate || emailToUpdate === authState.user?.email) {
      setIsEditingEmail(false);
      return;
    }

    setCredentialsLoading(true);
    try {
      const res = await authStore.updateCredentials({ email: emailToUpdate });
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success('Confirmation sent to new email address. Please verify to complete the change.');
        setIsEditingEmail(false);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update email address.');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: Event) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setCredentialsLoading(true);
    try {
      const res = await authStore.changePassword({ currentPassword, newPassword });
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success('Password updated successfully. Other active sessions have been signed out.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsChangingPassword(false);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await authStore.signOut();
    toast.success('Signed out successfully.', { duration: 2500 });
    onNavigate('/');
  };

  const handleSignOutAll = async () => {
    await authStore.signOutAll();
    toast.success('Signed out from all devices.', { duration: 2500 });
    onNavigate('/');
  };

  const handleScheduleDeletion = async () => {
    if (!confirm('Are you sure you want to schedule your account for deletion in 30 days?')) {
      return;
    }
    setDangerLoading(true);
    try {
      const res = await authStore.scheduleAccountDeletion();
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success('Account scheduled for deletion in 30 days.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule deletion.');
    } finally {
      setDangerLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setDangerLoading(true);
    try {
      const res = await authStore.cancelAccountDeletion();
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success('Account deletion cancelled.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel deletion.');
    } finally {
      setDangerLoading(false);
    }
  };

  const isScheduled = !!authState.profile?.scheduledDeleteAt;

  if (authState.isAuthLoading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Checking authorization...</p>
      </div>
    );
  }
  if (!authState.user) {
    return null;
  }

  return (
    <div className="account-settings-container">
      <div className="account-header">
        <h1 className="account-title">Account Settings</h1>
        <p className="account-subtitle">
          Manage your culinary identity, credentials, sessions, and data lifecycle.
        </p>
      </div>

      {/* 1. Public Identity (Variant A Stacked Card with Inline Pencil Edits) */}
      <section className="account-card">
        <div className="account-card-header">
          <div>
            <h2 className="account-card-title">
              <User size={18} /> Public Identity
            </h2>
            <p className="account-card-desc">
              Your public persona visible on published recipes and author credits.
            </p>
          </div>
        </div>

        <div className="account-profile-hero">
          <div className="account-profile-avatar">
            <CircleUser size={40} />
          </div>

          <div className="account-profile-meta">
            {/* Display Name Row */}
            <div className="account-field-row">
              {inlineEditing === 'displayName' ? (
                <>
                  <input
                    type="text"
                    className="inline-edit-input name-input"
                    value={editDisplayName}
                    onInput={(e) => setEditDisplayName((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') requestConfirmDisplayName();
                      if (e.key === 'Escape') cancelInlineEdit();
                    }}
                    disabled={identityLoading}
                    autoFocus
                    placeholder="Enter display name"
                  />
                  <div className="inline-edit-actions">
                    <button
                      type="button"
                      className="inline-edit-action-btn btn-save"
                      onClick={requestConfirmDisplayName}
                      disabled={identityLoading}
                      aria-label="Save display name"
                    >
                      <Check size={20} />
                    </button>
                    <button
                      type="button"
                      className="inline-edit-action-btn btn-cancel"
                      onClick={cancelInlineEdit}
                      disabled={identityLoading}
                      aria-label="Cancel editing"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <Tooltip content={displayNameCooldownText}>
                  <span className="account-field-interactive-group">
                    <span
                      className="account-display-name-text"
                      aria-label={`Display name: ${displayName || 'User'}`}
                    >
                      {displayName || 'User'}
                    </span>
                    {!isDisplayNameOnCooldown && inlineEditing === 'none' && (
                      <button
                        type="button"
                        className="inline-edit-pencil-btn"
                        onClick={startEditDisplayName}
                        aria-label="Edit display name"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </span>
                </Tooltip>
              )}
            </div>

            {/* Username Handle Row */}
            <div className="account-field-row">
              {inlineEditing === 'username' ? (
                <>
                  <input
                    type="text"
                    className="inline-edit-input user-input"
                    value={editUsername}
                    onInput={(e) => setEditUsername((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') requestConfirmUsername();
                      if (e.key === 'Escape') cancelInlineEdit();
                    }}
                    disabled={identityLoading}
                    autoFocus
                    placeholder="Enter username"
                  />
                  <div className="inline-edit-actions">
                    <button
                      type="button"
                      className="inline-edit-action-btn btn-save"
                      onClick={requestConfirmUsername}
                      disabled={identityLoading}
                      aria-label="Save username"
                    >
                      <Check size={20} />
                    </button>
                    <button
                      type="button"
                      className="inline-edit-action-btn btn-cancel"
                      onClick={cancelInlineEdit}
                      disabled={identityLoading}
                      aria-label="Cancel editing"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <Tooltip content={usernameCooldownText}>
                  <span className="account-field-interactive-group">
                    <span
                      className="account-username-text"
                      aria-label={`Username: @${username || 'user'}`}
                    >
                      @{username || 'user'}
                    </span>
                    {!isUsernameOnCooldown && inlineEditing === 'none' && (
                      <button
                        type="button"
                        className="inline-edit-pencil-btn"
                        onClick={startEditUsername}
                        aria-label="Edit username"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Credentials & Security (Separated into distinct section) */}
      <section className="account-card">
        <div className="account-card-header">
          <div>
            <h2 className="account-card-title">
              <Key size={18} /> Credentials &amp; Security
            </h2>
            <p className="account-card-desc">
              Manage your registered email and password credentials.
            </p>
          </div>
        </div>

        <div className="account-form-grid">
          {/* Email Row */}
          <div className="auth-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <label htmlFor="account-email" style={{ margin: 0 }}>Email Address</label>
              {!isEditingEmail && (
                <button
                  type="button"
                  className="account-secondary-btn"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => setIsEditingEmail(true)}
                >
                  Change Email
                </button>
              )}
            </div>

            {isEditingEmail ? (
              <form onSubmit={handleUpdateEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  id="account-email"
                  type="email"
                  value={newEmail}
                  onInput={(e) => setNewEmail((e.target as HTMLInputElement).value)}
                  disabled={credentialsLoading}
                  required
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="account-secondary-btn"
                    style={{ padding: '0.35rem 0.75rem' }}
                    onClick={() => {
                      setNewEmail(authState.user?.email || '');
                      setIsEditingEmail(false);
                    }}
                    disabled={credentialsLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="auth-submit-btn"
                    style={{ width: 'auto', padding: '0.35rem 0.85rem' }}
                    disabled={credentialsLoading}
                  >
                    Save Email
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-normal)' }}>
                {authState.user?.email || 'No email registered'}
              </div>
            )}
          </div>

          {/* Password Row */}
          <div className="auth-field" style={{ borderTop: '1px solid var(--background-modifier-border)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <div>
                <label style={{ margin: 0 }}>Password</label>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: '0.15rem' }}>
                  ••••••••••••••••
                </div>
              </div>

              {!isChangingPassword && (
                <button
                  type="button"
                  className="account-secondary-btn"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => setIsChangingPassword(true)}
                >
                  Change Password
                </button>
              )}
            </div>

            {isChangingPassword && (
              <form onSubmit={handleUpdatePassword} className="credentials-reveal-box">
                <div className="auth-field" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="account-current-pass">Current Password</label>
                  <input
                    id="account-current-pass"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onInput={(e) => setCurrentPassword((e.target as HTMLInputElement).value)}
                    disabled={credentialsLoading}
                    required
                  />
                </div>

                <div className="auth-field" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="account-new-pass">New Password</label>
                  <input
                    id="account-new-pass"
                    type="password"
                    placeholder="Enter new password (min. 8 characters)"
                    value={newPassword}
                    onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
                    disabled={credentialsLoading}
                    required
                  />
                </div>

                <div className="auth-field" style={{ marginBottom: '1rem' }}>
                  <label htmlFor="account-confirm-pass">Confirm New Password</label>
                  <input
                    id="account-confirm-pass"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                    disabled={credentialsLoading}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="account-secondary-btn"
                    style={{ padding: '0.35rem 0.75rem' }}
                    onClick={() => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setIsChangingPassword(false);
                    }}
                    disabled={credentialsLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="auth-submit-btn"
                    style={{ width: 'auto', padding: '0.35rem 0.85rem' }}
                    disabled={credentialsLoading}
                  >
                    Update Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 3. Session Management */}
      <section className="account-card">
        <div className="account-card-header">
          <div>
            <h2 className="account-card-title">
              <LogOut size={18} /> Session Management
            </h2>
            <p className="account-card-desc">
              End your active session on this device or revoke all active sessions.
            </p>
          </div>
        </div>

        <div className="account-btn-row">
          <button
            type="button"
            className="account-secondary-btn"
            onClick={handleSignOut}
          >
            <LogOut size={15} /> Sign Out
          </button>
          <button
            type="button"
            className="account-secondary-btn"
            onClick={handleSignOutAll}
          >
            <ShieldAlert size={15} /> Sign Out All Devices
          </button>
        </div>
      </section>

      {/* 4. Danger Zone */}
      <section className="account-card account-danger-zone">
        <div className="account-card-header">
          <div>
            <h2 className="account-card-title account-danger-title">
              <Trash2 size={18} /> Danger Zone
            </h2>
            <p className="account-card-desc">
              Schedule your account and owned recipes for permanent deletion.
            </p>
          </div>
        </div>

        {isScheduled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="auth-msg-banner error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>
                Account is scheduled for deletion on{' '}
                <strong>
                  {new Date(authState.profile!.scheduledDeleteAt!).toLocaleDateString()}
                </strong>
                .
              </span>
            </div>
            <div className="account-btn-row">
              <button
                type="button"
                className="account-secondary-btn"
                onClick={handleCancelDeletion}
                disabled={dangerLoading}
              >
                <Check size={15} /> Cancel Scheduled Deletion
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Scheduling deletion initiates a 30-day grace period. During this period, you can sign in and cancel the deletion request at any time. After 30 days, all account data is permanently erased.
            </p>
            <div className="account-btn-row">
              <button
                type="button"
                className="account-danger-btn"
                onClick={handleScheduleDeletion}
                disabled={dangerLoading}
              >
                <Trash2 size={15} /> Schedule Account Deletion (30 Days)
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Centralized Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.type === 'displayName' ? 'Change Display Name' : 'Change Username'}
        message={
          confirmModal ? (
            <>
              Do you want to change {confirmModal.type === 'displayName' ? 'Display Name' : 'Username'} to this{' '}
              <strong>
                {confirmModal.type === 'username' ? `@${confirmModal.pendingValue}` : confirmModal.pendingValue}
              </strong>?
            </>
          ) : null
        }
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        isLoading={identityLoading}
        onConfirm={handleConfirmModalSave}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
