-- 015_user_workspace_keys.sql
-- Dedicated vault for per-user local workspace encryption keys with strict Row Level Security.

CREATE TABLE IF NOT EXISTS public.user_workspace_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encryption_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.user_workspace_keys ENABLE ROW LEVEL SECURITY;

-- Security: Authenticated users can only read their own key.
-- Strictly no admin bypass to prevent cross-account key compromise.
DROP POLICY IF EXISTS "Users can only select their own workspace key" ON public.user_workspace_keys;
CREATE POLICY "Users can only select their own workspace key"
  ON public.user_workspace_keys FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Security: Authenticated users can only insert their own key.
DROP POLICY IF EXISTS "Users can only insert their own workspace key" ON public.user_workspace_keys;
CREATE POLICY "Users can only insert their own workspace key"
  ON public.user_workspace_keys FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Security: Authenticated users can only update their own key.
DROP POLICY IF EXISTS "Users can only update their own workspace key" ON public.user_workspace_keys;
CREATE POLICY "Users can only update their own workspace key"
  ON public.user_workspace_keys FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Grant privileges to authenticated role
GRANT SELECT, INSERT, UPDATE ON public.user_workspace_keys TO authenticated;
