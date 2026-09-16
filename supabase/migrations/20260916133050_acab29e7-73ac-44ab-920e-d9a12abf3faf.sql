ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS handle text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION private.can_create_profile(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.is_app_admin(_user_id) OR EXISTS (
    SELECT 1
    FROM public.user_profile_roles upr
    JOIN public.role_permissions rp ON rp.role_id = upr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE upr.user_id = _user_id
      AND p.module = 'perfis'
      AND p.action = 'criar'
  );
$$;

REVOKE ALL ON FUNCTION private.can_create_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_create_profile(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (private.can_create_profile(auth.uid()));

CREATE OR REPLACE FUNCTION public.grant_creator_profile_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  uid uuid := auth.uid();
  manager_role uuid;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL THEN
    UPDATE public.profiles SET created_by = uid WHERE id = NEW.id;
  END IF;
  IF private.is_app_admin(uid) THEN RETURN NEW; END IF;
  SELECT id INTO manager_role FROM public.roles WHERE name = 'Gerente' LIMIT 1;
  IF manager_role IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.user_profile_roles (user_id, profile_id, role_id)
  VALUES (uid, NEW.id, manager_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_creator_profile_access() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS grant_creator_profile_access_trg ON public.profiles;
CREATE TRIGGER grant_creator_profile_access_trg
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_creator_profile_access();