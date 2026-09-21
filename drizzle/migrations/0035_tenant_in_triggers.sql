CREATE OR REPLACE FUNCTION public.track_job_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    UPDATE public.job_stage_events
      SET exited_at = now()
      WHERE job_id = NEW.id AND exited_at IS NULL;
  END IF;

  INSERT INTO public.job_stage_events (job_id, profile_id, status, entered_at, tenant_id)
  VALUES (NEW.id, NEW.profile_id, NEW.status, now(), NEW.tenant_id);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_creator_profile_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  uid uuid := auth.uid();
  manager_role uuid;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL THEN
    UPDATE public.profiles SET created_by = uid WHERE id = NEW.id;
  END IF;
  IF private.is_app_admin(uid) THEN RETURN NEW; END IF;
  SELECT id INTO manager_role FROM public.roles WHERE name = 'Gerente' AND tenant_id = NEW.tenant_id LIMIT 1;
  IF manager_role IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.user_profile_roles (user_id, profile_id, role_id, tenant_id)
  VALUES (uid, NEW.id, manager_role, NEW.tenant_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;