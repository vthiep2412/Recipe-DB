-- 0002_creator_applications.sql
CREATE TABLE IF NOT EXISTS public.creator_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_text TEXT NOT NULL CHECK (char_length(application_text) >= 20 AND char_length(application_text) <= 5000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_creator_apps_user_id ON public.creator_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_apps_status ON public.creator_applications(status);

-- Security definer function to approve creator applications atomically
CREATE OR REPLACE FUNCTION public.approve_creator_application(app_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_admin_role TEXT;
BEGIN
  -- Verify caller is admin
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
  IF v_admin_role IS NULL OR v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: only admins can approve creator applications';
  END IF;

  SELECT user_id INTO v_user_id FROM public.creator_applications WHERE id = app_id AND status = 'pending';
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.creator_applications
  SET status = 'approved',
      reviewed_at = NOW(),
      reviewed_by = auth.uid()
  WHERE id = app_id;

  UPDATE public.profiles
  SET role = 'recipe_creator',
      updated_at = NOW()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;
