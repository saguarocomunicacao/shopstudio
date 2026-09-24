ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS favorito boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS jobs_profile_favorito_idx ON public.jobs(profile_id) WHERE favorito;