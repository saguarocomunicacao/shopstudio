CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_app_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profile_roles upr
    JOIN public.roles r ON r.id = upr.role_id
    WHERE upr.user_id = _user_id AND r.is_admin
  );
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_user_id uuid, _profile_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_app_admin(_user_id) OR EXISTS (
    SELECT 1
    FROM public.user_profile_roles upr
    JOIN public.role_permissions rp ON rp.role_id = upr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE upr.user_id = _user_id
      AND upr.profile_id IS NOT DISTINCT FROM _profile_id
      AND p.module = _module
      AND p.action = _action
  );
$$;

CREATE OR REPLACE FUNCTION private.admin_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT upr.user_id)::int
  FROM public.user_profile_roles upr
  JOIN public.roles r ON r.id = upr.role_id
  WHERE r.is_admin;
$$;

GRANT EXECUTE ON FUNCTION private.is_app_admin(uuid), private.has_permission(uuid, uuid, text, text), private.admin_count() TO authenticated, service_role;

-- repoint policies
DROP POLICY "profiles_select" ON public.profiles;
DROP POLICY "profiles_insert" ON public.profiles;
DROP POLICY "profiles_update" ON public.profiles;
DROP POLICY "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (private.has_permission(auth.uid(), id, 'perfis', 'visualizar'));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (private.is_app_admin(auth.uid()));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (private.has_permission(auth.uid(), id, 'perfis', 'editar'))
WITH CHECK (private.has_permission(auth.uid(), id, 'perfis', 'editar'));
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
USING (private.is_app_admin(auth.uid()));

DROP POLICY "app_users_select" ON public.app_users;
DROP POLICY "app_users_update_self" ON public.app_users;
DROP POLICY "app_users_delete_admin" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users FOR SELECT TO authenticated
USING (id = auth.uid() OR private.is_app_admin(auth.uid()));
CREATE POLICY "app_users_update_self" ON public.app_users FOR UPDATE TO authenticated
USING (id = auth.uid() OR private.is_app_admin(auth.uid()))
WITH CHECK (id = auth.uid() OR private.is_app_admin(auth.uid()));
CREATE POLICY "app_users_delete_admin" ON public.app_users FOR DELETE TO authenticated
USING (private.is_app_admin(auth.uid()));

DROP POLICY "roles_write" ON public.roles;
CREATE POLICY "roles_write" ON public.roles FOR ALL TO authenticated
USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

DROP POLICY "role_permissions_write" ON public.role_permissions;
CREATE POLICY "role_permissions_write" ON public.role_permissions FOR ALL TO authenticated
USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

DROP POLICY "upr_select" ON public.user_profile_roles;
DROP POLICY "upr_write" ON public.user_profile_roles;
CREATE POLICY "upr_select" ON public.user_profile_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_app_admin(auth.uid()));
CREATE POLICY "upr_write" ON public.user_profile_roles FOR ALL TO authenticated
USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

DROP POLICY "invites_admin" ON public.user_invites;
CREATE POLICY "invites_admin" ON public.user_invites FOR ALL TO authenticated
USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

-- ensure_app_user uses private helpers
CREATE OR REPLACE FUNCTION public.ensure_app_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  mail text := coalesce(auth.jwt() ->> 'email', '');
  display text := coalesce(auth.jwt() -> 'user_metadata' ->> 'name', split_part(coalesce(auth.jwt() ->> 'email',''), '@', 1));
  admin_role uuid;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  INSERT INTO public.app_users (id, email, name)
  VALUES (uid, mail, display)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  DELETE FROM public.user_invites WHERE lower(email) = lower(mail);

  IF private.admin_count() = 0 THEN
    SELECT id INTO admin_role FROM public.roles WHERE is_admin LIMIT 1;
    INSERT INTO public.user_profile_roles (user_id, profile_id, role_id)
    VALUES (uid, NULL, admin_role)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.is_app_admin(uuid);
DROP FUNCTION IF EXISTS public.has_permission(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_count();

REVOKE EXECUTE ON FUNCTION public.protect_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_admin_role_permissions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_app_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_app_user() TO authenticated;