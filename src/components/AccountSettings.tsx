import { useState, useEffect } from 'preact/hooks';
import { User, AtSign, Clock, CheckCircle2, AlertCircle, Loader } from 'lucide-preact';
import { authProfile, authUser, fetchProfile } from '../services/authStore';
import { supabase } from '../services/supabaseClient';

export function AccountSettings() {
  const profile = authProfile.value;
  const user = authUser.value;

  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setDisplayName(profile.display_name);
    }
  }, [profile]);

  if (!user) {
    return (
      <div class="account-settings-container" style={{ textAlign: 'center' }}>
        <p>Please log in to view account settings.</p>
      </div>
    );
  }

  // Calculate cooldowns
  const getUsernameCooldownDays = (): number => {
    if (!profile?.last_username_change) return 0;
    const last = new Date(profile.last_username_change).getTime();
    const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return diffDays < 14 ? Math.ceil(14 - diffDays) : 0;
  };

  const getDisplayNameCooldownDays = (): number => {
    if (!profile?.last_display_name_change) return 0;
    const last = new Date(profile.last_display_name_change).getTime();
    const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return diffDays < 3 ? Math.ceil(3 - diffDays) : 0;
  };

  const usernameCooldown = getUsernameCooldownDays();
  const displayNameCooldown = getDisplayNameCooldownDays();

  const handleUpdate = async (e: Event) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const updates: Record<string, any> = {};
      if (username !== profile?.username) updates.username = username;
      if (displayName !== profile?.display_name) updates.display_name = displayName;

      if (Object.keys(updates).length === 0) {
        setMessage({ type: 'error', text: 'No changes detected.' });
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        await fetchProfile(user.id);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="account-settings-container">
      <h2 class="account-settings-title">
        <User size={24} /> Account Settings
      </h2>

      {message && (
        <div
          class="auth-error-msg"
          style={{
            marginBottom: '1rem',
            background: message.type === 'success' ? 'rgba(51, 160, 88, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            borderColor: message.type === 'success' ? '#33a058' : '#ef4444',
            color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleUpdate} class="auth-form-view" style={{ maxWidth: '100%' }}>
        <div class="auth-input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Username</label>
            {usernameCooldown > 0 && (
              <span class="cooldown-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} /> {usernameCooldown}d cooldown
              </span>
            )}
          </div>
          <div class="auth-input-wrapper">
            <AtSign class="auth-input-icon" size={16} />
            <input
              type="text"
              class="auth-input"
              value={username}
              disabled={usernameCooldown > 0 && profile?.role !== 'admin'}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              required
            />
          </div>
        </div>

        <div class="auth-input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Display Name</label>
            {displayNameCooldown > 0 && (
              <span class="cooldown-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} /> {displayNameCooldown}d cooldown
              </span>
            )}
          </div>
          <div class="auth-input-wrapper">
            <User class="auth-input-icon" size={16} />
            <input
              type="text"
              class="auth-input"
              value={displayName}
              disabled={displayNameCooldown > 0 && profile?.role !== 'admin'}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              required
            />
          </div>
        </div>

        <div class="auth-input-group">
          <label>Email Address</label>
          <div class="auth-input-wrapper">
            <input
              type="email"
              class="auth-input"
              style={{ paddingLeft: '0.75rem' }}
              value={user.email || ''}
              disabled
            />
          </div>
        </div>

        <button type="submit" class="auth-submit-btn" disabled={loading}>
          {loading ? <Loader size={18} class="animate-spin" /> : 'Save Profile Changes'}
        </button>
      </form>
    </div>
  );
}
