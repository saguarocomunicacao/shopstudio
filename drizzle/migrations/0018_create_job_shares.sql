CREATE TABLE public.job_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  views integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_shares_job_id_idx ON public.job_shares (job_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_shares TO authenticated;
GRANT ALL ON public.job_shares TO service_role;

ALTER TABLE public.job_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quem enxerga o job enxerga os links"
ON public.job_shares FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id));

CREATE POLICY "Quem edita o pipeline cria links"
ON public.job_shares FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_pipeline(j.profile_id)));

CREATE POLICY "Quem edita o pipeline revoga links"
ON public.job_shares FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_pipeline(j.profile_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_pipeline(j.profile_id)));

CREATE POLICY "Quem edita o pipeline apaga links"
ON public.job_shares FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND public.can_edit_pipeline(j.profile_id)));