ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_from_status public.job_status;

CREATE INDEX IF NOT EXISTS jobs_deleted_at_idx ON public.jobs (profile_id, deleted_at);

COMMENT ON COLUMN public.jobs.deleted_at IS 'Soft delete: quando preenchido, o job esta na Lixeira.';
COMMENT ON COLUMN public.jobs.deleted_from_status IS 'Status em que o job estava antes de ir para a Lixeira.';