import { signal, computed } from '@preact/signals';
import { supabase } from './supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  role: 'user' | 'recipe_creator' | 'admin';
  is_archived?: boolean;
  scheduled_delete_at?: string;
  created_at?: string;
  updated_at?: string;
  last_username_change?: string;
  last_display_name_change?: string;
}

export const authUser = signal<User | null>(null);
export const authProfile = signal<UserProfile | null>(null);
export const authSession = signal<Session | null>(null);
export const authLoading = signal<boolean>(true);
export const isAuthModalOpen = signal<boolean>(false);

export const userRole = computed(() => authProfile.value?.role || 'user');
export const isAuthenticated = computed(() => !!authUser.value);

export async function fetchProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      authProfile.value = data as UserProfile;
    } else if (error) {
      console.warn('Failed to fetch profile:', error.message);
    }
  } catch (err) {
    console.error('Error fetching profile:', err);
  }
}

export async function initAuth() {
  authLoading.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    authSession.value = session;
    authUser.value = session?.user ?? null;

    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  } catch (err) {
    console.error('Error initializing auth:', err);
  } finally {
    authLoading.value = false;
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    authSession.value = session;
    authUser.value = session?.user ?? null;
    if (session?.user) {
      await fetchProfile(session.user.id);
    } else {
      authProfile.value = null;
    }
    authLoading.value = false;
  });
}

export async function signOut() {
  await supabase.auth.signOut();
  authUser.value = null;
  authProfile.value = null;
  authSession.value = null;
}

export function openAuthModal() {
  isAuthModalOpen.value = true;
}

export function closeAuthModal() {
  isAuthModalOpen.value = false;
}
