-- 0001_profiles.sql
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (
    char_length(username) >= 3 AND
    char_length(username) <= 24 AND
    username ~ '^[a-z0-9_]+$'
  ),
  display_name TEXT NOT NULL CHECK (
    char_length(display_name) >= 2 AND
    char_length(display_name) <= 50
  ),
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'recipe_creator', 'admin')),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_delete_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_username_change TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  last_display_name_change TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00'
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
