ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS video_storage_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS video_storage_error text,
  ADD COLUMN IF NOT EXISTS video_storage_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_storage_updated_at timestamptz;

-- Jobs que já têm cópia local ficam marcados como salvos.
UPDATE public.jobs SET video_storage_status = 'salvo' WHERE video_path IS NOT NULL AND video_storage_status <> 'salvo';

CREATE INDEX IF NOT EXISTS jobs_video_storage_pending_idx
  ON public.jobs (video_storage_status)
  WHERE video_path IS NULL;