ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS video_path text,
  ADD COLUMN IF NOT EXISTS video_thumbnail_path text,
  ADD COLUMN IF NOT EXISTS published_url text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.profile_video_settings
  ADD COLUMN IF NOT EXISTS require_review boolean NOT NULL DEFAULT true;