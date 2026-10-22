import { useState, useEffect } from 'preact/hooks';
import { User, Key, LogOut, Trash2, Clock, Check, AlertCircle, ShieldAlert } from 'lucide-preact';
import { authStore } from '../services/authStore';

export interface AccountSettingsProps {
  onNavigate: (path: string) => void;
}

export function AccountSettings({ onNavigate }: AccountSettingsProps) {
  const [authState, setAuthState] = useState(authStore.getState());

  // Identity Form
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityMsg, setIdentityMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Credentials Form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsMsg, setCredentialsMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Danger Zone
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerMsg, setDangerMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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
  const usernameElapsed = now - usernameLastChanged;
  const isUsernameOnCooldown = usernameLastChanged > 0 && usernameElapsed < usernameCooldownMs;
  const usernameRemainingDays = isUsernameOnCooldown
    ? Math.ceil((usernameCooldownMs - usernameElapsed) / (24 * 60 * 60 * 1000))
    : 0;

  const displayNameCooldownMs = 24 * 60 * 60 * 1000;
  const displayNameLastChanged = authState.profile?.displayNameLastChangedAt
    ? new Date(authState.profile.displayNameLastChangedAt).getTime()
    : 0;
  const displayNameElapsed = now - displayNameLastChanged;
  const isDisplayNameOnCooldown = displayNameLastChanged > 0 && displayNameElapsed < displayNameCooldownMs;
  const displayNameRemainingHours = isDisplayNameOnCooldown
    ? Math.ceil((displayNameCooldownMs - displayNameElapsed) / (60 * 60 * 1000))
    : 0;

  const handleUpdateIdentity = async (e: Event) => {
    e.preventDefault();
    setIdentityMsg(null);
    setIdentityLoading(true);

    try {
      const cleanUsername = username.trim().replace(/^@/, '');
      const profile = authState.profile;

      if (profile && cleanUsername !== profile.username) {
        if (isUsernameOnCooldown) {
          setIdentityMsg({
            type: 'error',
            text: `Username can only be changed once every 30 days (${usernameRemainingDays} days left).`,
          });
          setIdentityLoading(false);
          return;
        }
        const userRes = await authStore.updateUsername(cleanUsername);
        if (userRes?.error) {
          setIdentityMsg({ type: 'error', text: userRes.error });
          setIdentityLoading(false);
          return;
        }
      }

      if (profile && displayName.trim() !== profile.displayName) {
        if (isDisplayNameOnCooldown) {
          setIdentityMsg({
            type: 'error',
            text: `Display name can only be changed once every 24 hours (${displayNameRemainingHours} hours left).`,
          });
          setIdentityLoading(false);
          return;
        }
        const nameRes = await authStore.updateDisplayName(displayName.trim());
        if (nameRes?.error) {
          setIdentityMsg({ type: 'error', text: nameRes.error });
          setIdentityLoading(false);
          return;
        }
      }

      setIdentityMsg({ type: 'success', text: 'Identity updated successfully.' });
    } catch (err: unknown) {
      setIdentityMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setIdentityLoading(false);
    }
  };

  const handleUpdateCredentials = async (e: Event) => {
    e.preventDefault();
    setCredentialsMsg(null);

    const emailToUpdate = newEmail.trim() !== authState.user?.email ? newEmail.trim() : undefined;
    let passwordToUpdate: string | undefined = undefined;

    if (newPassword) {
      if (newPassword.length < 8) {
        setCredentialsMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setCredentialsMsg({ type: 'error', text: 'Passwords do not match.' });
        return;
      }
      passwordToUpdate = newPassword;
    }

    if (!emailToUpdate && !passwordToUpdate) {
      setCredentialsMsg({ type: 'error', text: 'No changes provided.' });
      return;
    }

    setCredentialsLoading(true);
    try {
      const res = await authStore.updateCredentials({
        email: emailToUpdate,
        password: passwordToUpdate,
      });
      if (res?.error) {
        setCredentialsMsg({ type: 'error', text: res.error });
      } else {
        setCredentialsMsg({
          type: 'success',
          text: emailToUpdate
            ? 'Confirmation sent to new email address. Please verify to finish email change.'
            : 'Password updated successfully.',
        });
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: unknown) {
      setCredentialsMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update credentials.',
      });
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await authStore.signOut();
    onNavigate('/');
  };

  const handleSignOutAll = async () => {
    await authStore.signOutAll();
    onNavigate('/');
  };

  const handleScheduleDeletion = async () => {
    if (!confirm('Are you sure you want to schedule your account for deletion in 30 days?')) {
      return;
    }
    setDangerLoading(true);
    setDangerMsg(null);
    try {
      const res = await authStore.scheduleAccountDeletion();
      if (res?.error) {
        setDangerMsg({ type: 'error', text: res.error });
      } else {
        setDangerMsg({ type: 'success', text: 'Account scheduled for deletion in 30 days.' });
      }
    } catch (err: unknown) {
      setDangerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to schedule deletion.',
      });
    } finally {
      setDangerLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setDangerLoading(true);
    setDangerMsg(null);
    try {
      const res = await authStore.cancelAccountDeletion();
      if (res?.error) {
        setDangerMsg({ type: 'error', text: res.error });
      } else {
        setDangerMsg({ type: 'success', text: 'Account deletion cancelled.' });
      }
    } catch (err: unknown) {
      setDangerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to cancel deletion.',
      });
    } finally {
      setDangerLoading(false);
    }
  };

  const isScheduled = !!authState.profile?.scheduledDeleteAt;

  return (
    <div className="account-settings-container">
      <div className="account-header">
        <h1 className="account-title">Account Settings</h1>
        <p className="account-subtitle">
          Manage your culinary identity, credentials, sessions, and data lifecycle.
        </p>
      </div>

      {/* 1. Identity */}
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

        {identityMsg && (
          <div className={`auth-msg-banner ${identityMsg.type}`}>
            {identityMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdateIdentity} className="account-form-grid">
          <div className="auth-field">
            <label htmlFor="account-display-name">Display Name</label>
            <input
              id="account-display-name"
              type="text"
              value={displayName}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              disabled={identityLoading}
              required
            />
            {isDisplayNameOnCooldown ? (
              <span className="account-cooldown-badge">
                <Clock size={12} /> Cooldown active: {displayNameRemainingHours}h remaining
              </span>
            ) : (
              <span style={{ fontSize: '0.725rem', color: 'var(--text-faint)' }}>
                Can be updated once every 24 hours.
              </span>
            )}
          </div>

          <div className="auth-field">
            <label htmlFor="account-username">Username (@handle)</label>
            <input
              id="account-username"
              type="text"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              disabled={identityLoading}
              required
            />
            {isUsernameOnCooldown ? (
              <span className="account-cooldown-badge">
                <Clock size={12} /> Cooldown active: {usernameRemainingDays} days remaining
              </span>
            ) : (
              <span style={{ fontSize: '0.725rem', color: 'var(--text-faint)' }}>
                Can be updated once every 30 days.
              </span>
            )}
          </div>

          <div className="account-btn-row">
            <button
              type="submit"
              className="auth-submit-btn"
              style={{ width: 'auto', padding: '0.55rem 1.25rem' }}
              disabled={identityLoading}
            >
              {identityLoading ? 'Saving...' : 'Save Identity'}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Credentials */}
      <section className="account-card">
        <div className="account-card-header">
          <div>
            <h2 className="account-card-title">
              <Key size={18} /> Credentials & Security
            </h2>
            <p className="account-card-desc">
              Update your registered email or change your password.
            </p>
          </div>
        </div>

        {credentialsMsg && (
          <div className={`auth-msg-banner ${credentialsMsg.type}`}>
            {credentialsMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdateCredentials} className="account-form-grid">
          <div className="auth-field">
            <label htmlFor="account-email">Email Address</label>
            <input
              id="account-email"
              type="email"
              value={newEmail}
              onInput={(e) => setNewEmail((e.target as HTMLInputElement).value)}
              disabled={credentialsLoading}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="account-new-password">New Password</label>
            <input
              id="account-new-password"
              type="password"
              placeholder="Leave blank to keep current"
              value={newPassword}
              onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
              disabled={credentialsLoading}
            />
          </div>

          {newPassword && (
            <div className="auth-field">
              <label htmlFor="account-confirm-password">Confirm New Password</label>
              <input
                id="account-confirm-password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                disabled={credentialsLoading}
                required
              />
            </div>
          )}

          <div className="account-btn-row">
            <button
              type="submit"
              className="auth-submit-btn"
              style={{ width: 'auto', padding: '0.55rem 1.25rem' }}
              disabled={credentialsLoading}
            >
              {credentialsLoading ? 'Updating...' : 'Update Credentials'}
            </button>
          </div>
        </form>
      </section>

      {/* 3. Session */}
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

        {dangerMsg && (
          <div className={`auth-msg-banner ${dangerMsg.type}`}>
            {dangerMsg.text}
          </div>
        )}

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
    </div>
  );
}
