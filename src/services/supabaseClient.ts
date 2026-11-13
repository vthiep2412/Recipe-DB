import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

if (import.meta.env.PROD && (!rawUrl || !rawKey)) {
  throw new Error('Supabase configuration missing: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in production.');
}

export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

const url = rawUrl || 'https://placeholder.supabase.co';
const key = rawKey || 'placeholder';

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
