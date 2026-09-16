CREATE TABLE public.job_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status job_status NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz
);

CREATE INDEX job_stage_events_job_idx ON public.job_stage_events (job_id, entered_at);

GRANT SELECT ON public.job_stage_events TO authenticated;
GRANT ALL ON public.job_stage_events TO service_role;

ALTER TABLE public.job_stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_stage_events_select ON public.job_stage_events
  FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), profile_id, 'pipeline', 'visualizar'));

CREATE OR REPLACE FUNCTION public.track_job_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    UPDATE public.job_stage_events
      SET exited_at = now()
      WHERE job_id = NEW.id AND exited_at IS NULL;
  END IF;

  INSERT INTO public.job_stage_events (job_id, profile_id, status, entered_at)
  VALUES (NEW.id, NEW.profile_id, NEW.status, now());

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.track_job_stage() FROM PUBLIC;

CREATE TRIGGER track_job_stage_trg
AFTER INSERT OR UPDATE OF status ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.track_job_stage();

INSERT INTO public.job_stage_events (job_id, profile_id, status, entered_at)
SELECT id, profile_id, status, COALESCE(updated_at, created_at) FROM public.jobs;