CREATE TABLE profiles (
  id                           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username                     TEXT UNIQUE NOT NULL,
  display_name                 TEXT NOT NULL,
  role                         TEXT NOT NULL DEFAULT 'user'
                                 CHECK (role IN ('user','recipe_creator','admin')),
  username_last_changed_at     TIMESTAMPTZ,
  display_name_last_changed_at TIMESTAMPTZ,
  is_archived                  BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_delete_at          TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
