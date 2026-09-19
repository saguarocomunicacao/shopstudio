ALTER TABLE public.tiktok_connections
  ADD COLUMN IF NOT EXISTS user_type integer,
  ADD COLUMN IF NOT EXISTS granted_scopes text[] NOT NULL DEFAULT '{}'::text[];