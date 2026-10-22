import { useState, useEffect } from 'preact/hooks';
import { supabase } from './supabaseClient';
import type {
  AuthState,
  AuthUser,
  UserProfile,
  UserRole,
  AuthStoreAPI
} from '../types/cloud';

const initialAuthState: AuthState = {
  user: null,
  profile: null,
  role: null,
  isAuthLoading: true,
  showModal: false,
  modalContextCaption: null
};

let currentAuthState: AuthState = { ...initialAuthState };
const listeners = new Set<(state: AuthState) => void>();

function notifyListeners(): void {
  listeners.forEach(fn => fn(currentAuthState));
}

function mapProfileRow(row: any): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: (row.role as UserRole) || 'user',
    usernameLastChangedAt: row.username_last_changed_at ?? null,
    displayNameLastChangedAt: row.display_name_last_changed_at ?? null,
    isArchived: Boolean(row.is_archived),
    scheduledDeleteAt: row.scheduled_delete_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function fetchProfileForUser(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return mapProfileRow(data);
  } catch {
    return null;
  }
}

async function syncSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      currentAuthState = {
        ...currentAuthState,
        user: null,
        profile: null,
        role: null,
        isAuthLoading: false
      };
      notifyListeners();
      return;
    }

    const authUser: AuthUser = {
      id: session.user.id,
      email: session.user.email ?? ''
    };

    const profile = await fetchProfileForUser(session.user.id);
    currentAuthState = {
      ...currentAuthState,
      user: authUser,
      profile,
      role: profile?.role ?? 'user',
      isAuthLoading: false
    };
    notifyListeners();
  } catch {
    currentAuthState = {
      ...currentAuthState,
      isAuthLoading: false
    };
    notifyListeners();
  }
}

if (typeof window !== 'undefined') {
  syncSession();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      currentAuthState = {
        ...currentAuthState,
        user: null,
        profile: null,
        role: null,
        isAuthLoading: false
      };
      notifyListeners();
      return;
    }

    const authUser: AuthUser = {
      id: session.user.id,
      email: session.user.email ?? ''
    };

    const profile = await fetchProfileForUser(session.user.id);
    currentAuthState = {
      ...currentAuthState,
      user: authUser,
      profile,
      role: profile?.role ?? 'user',
      isAuthLoading: false
    };
    notifyListeners();
  });
}

export const authStore: AuthStoreAPI = {
  useAuth(): AuthState {
    const [state, setState] = useState<AuthState>(currentAuthState);

    useEffect(() => {
      setState(currentAuthState);
      return authStore.subscribe(next => {
        setState(next);
      });
    }, []);

    return state;
  },

  getState(): AuthState {
    return currentAuthState;
  },

  openAuthModal(caption?: string): void {
    currentAuthState = {
      ...currentAuthState,
      showModal: true,
      modalContextCaption: caption ?? null
    };
    notifyListeners();
  },

  closeAuthModal(): void {
    currentAuthState = {
      ...currentAuthState,
      showModal: false,
      modalContextCaption: null
    };
    notifyListeners();
  },

  async signIn(email: string, password: string): Promise<{ error?: string }> {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { error: error.message };
      }

      await syncSession();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to sign in' };
    }
  },

  async signUp(params: {
    email: string;
    password: string;
    username: string;
    displayName: string;
  }): Promise<{ error?: string }> {
    try {
      const { error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            username: params.username,
            display_name: params.displayName
          }
        }
      });

      if (error) {
        return { error: error.message };
      }

      await syncSession();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to create account' };
    }
  },

  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } finally {
      currentAuthState = {
        ...currentAuthState,
        user: null,
        profile: null,
        role: null,
        isAuthLoading: false
      };
      notifyListeners();
    }
  },

  async signOutAll(): Promise<void> {
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } finally {
      currentAuthState = {
        ...currentAuthState,
        user: null,
        profile: null,
        role: null,
        isAuthLoading: false
      };
      notifyListeners();
    }
  },

  async updateDisplayName(name: string): Promise<{ error?: string }> {
    const user = currentAuthState.user;
    if (!user) {
      return { error: 'Not authenticated' };
    }

    const trimmed = name.trim();
    if (!trimmed) {
      return { error: 'Display name cannot be empty' };
    }

    // Cooldown check (24 hours) client-side before network request
    const profile = currentAuthState.profile;
    if (profile?.displayNameLastChangedAt) {
      const lastChanged = new Date(profile.displayNameLastChangedAt).getTime();
      const elapsed = Date.now() - lastChanged;
      const cooldownMs = 24 * 60 * 60 * 1000;
      if (lastChanged > 0 && elapsed < cooldownMs) {
        const remainingHours = Math.ceil((cooldownMs - elapsed) / (60 * 60 * 1000));
        return {
          error: `Display name can only be changed once every 24 hours (${remainingHours} hours left).`
        };
      }
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: trimmed,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        return { error: error.message };
      }

      const updatedProfile = await fetchProfileForUser(user.id);
      currentAuthState = {
        ...currentAuthState,
        profile: updatedProfile
      };
      notifyListeners();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update display name' };
    }
  },

  async updateUsername(handle: string): Promise<{ error?: string }> {
    const user = currentAuthState.user;
    if (!user) {
      return { error: 'Not authenticated' };
    }

    const cleanHandle = handle.trim().replace(/^@/, '');
    if (!cleanHandle) {
      return { error: 'Username cannot be empty' };
    }

    // Cooldown check (30 days) client-side before network request
    const profile = currentAuthState.profile;
    if (profile?.usernameLastChangedAt) {
      const lastChanged = new Date(profile.usernameLastChangedAt).getTime();
      const elapsed = Date.now() - lastChanged;
      const cooldownMs = 30 * 24 * 60 * 60 * 1000;
      if (lastChanged > 0 && elapsed < cooldownMs) {
        const remainingDays = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
        return {
          error: `Username can only be changed once every 30 days (${remainingDays} days left).`
        };
      }
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: cleanHandle,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        return { error: error.message };
      }

      const updatedProfile = await fetchProfileForUser(user.id);
      currentAuthState = {
        ...currentAuthState,
        profile: updatedProfile
      };
      notifyListeners();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update username' };
    }
  },

  async updateCredentials(params: {
    email?: string;
    password?: string;
  }): Promise<{ error?: string }> {
    try {
      const updateData: { email?: string; password?: string } = {};
      if (params.email) updateData.email = params.email;
      if (params.password) updateData.password = params.password;

      const { error } = await supabase.auth.updateUser(updateData);
      if (error) {
        return { error: error.message };
      }

      await syncSession();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to update credentials' };
    }
  },

  async scheduleAccountDeletion(): Promise<{ error?: string }> {
    const user = currentAuthState.user;
    if (!user) {
      return { error: 'Not authenticated' };
    }

    try {
      const targetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('profiles')
        .update({
          scheduled_delete_at: targetDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        return { error: error.message };
      }

      const updatedProfile = await fetchProfileForUser(user.id);
      currentAuthState = {
        ...currentAuthState,
        profile: updatedProfile
      };
      notifyListeners();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to schedule deletion' };
    }
  },

  async cancelAccountDeletion(): Promise<{ error?: string }> {
    const user = currentAuthState.user;
    if (!user) {
      return { error: 'Not authenticated' };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          scheduled_delete_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        return { error: error.message };
      }

      const updatedProfile = await fetchProfileForUser(user.id);
      currentAuthState = {
        ...currentAuthState,
        profile: updatedProfile
      };
      notifyListeners();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to cancel scheduled deletion' };
    }
  },

  subscribe(listener: (state: AuthState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

export const useAuth = authStore.useAuth;
