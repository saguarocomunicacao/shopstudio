ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS automation_schedule_id uuid REFERENCES public.automation_schedules(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jobs.automation_schedule_id IS 'Agenda de automacao que originou o job (NULL = criado por uma pessoa).';

CREATE INDEX IF NOT EXISTS jobs_automation_schedule_idx ON public.jobs (automation_schedule_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  schedule_id uuid NOT NULL REFERENCES public.automation_schedules(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  dia date NOT NULL,
  horario text NOT NULL,
  status text NOT NULL DEFAULT 'gerando',
  mensagem text,
  custo_estimado_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_runs_status_chk CHECK (status IN ('gerando', 'concluido', 'falhou', 'sem_produto', 'pausado')),
  CONSTRAINT automation_runs_unico UNIQUE (schedule_id, dia, horario)
);

COMMENT ON TABLE public.automation_runs IS 'Execucoes das agendas de automacao. UNIQUE(schedule_id, dia, horario) garante idempotencia absoluta.';

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_runs_select" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.can_view_profile(profile_id));

CREATE TRIGGER automation_runs_updated_at
  BEFORE UPDATE ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS automation_runs_schedule_idx ON public.automation_runs (schedule_id, created_at DESC);