ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS render_id text,
  ADD COLUMN IF NOT EXISTS render_error text,
  ADD COLUMN IF NOT EXISTS render_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_thumbnail_url text;

CREATE INDEX IF NOT EXISTS jobs_render_id_idx ON public.jobs (render_id);