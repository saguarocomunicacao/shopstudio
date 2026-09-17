-- Status de aprovacao de cadastro
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

CREATE OR REPLACE FUNCTION private.super_admin_email()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'saguaro.comunicacao@gmail.com'::text $$;

CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id AND lower(u.email) = private.super_admin_email()
  );
$$;

CREATE OR REPLACE FUNCTION private.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.app_users au WHERE au.id = _user_id AND au.status = 'aprovado'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_super_admin(auth.uid());
$$;

-- Nenhuma permissao vale antes da aprovacao
CREATE OR REPLACE FUNCTION private.is_app_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_super_admin(_user_id) OR (
    private.is_approved(_user_id) AND EXISTS (
      SELECT 1 FROM public.user_profile_roles upr
      JOIN public.roles r ON r.id = upr.role_id
      WHERE upr.user_id = _user_id AND r.is_admin
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.has_permission(_user_id uuid, _profile_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_app_admin(_user_id) OR (
    private.is_approved(_user_id) AND EXISTS (
      SELECT 1
      FROM public.user_profile_roles upr
      JOIN public.role_permissions rp ON rp.role_id = upr.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE upr.user_id = _user_id
        AND upr.profile_id IS NOT DISTINCT FROM _profile_id
        AND p.module = _module
        AND p.action = _action
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.has_global_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
  SELECT private.is_app_admin(_user_id) OR (
    private.is_approved(_user_id) AND EXISTS (
      SELECT 1 FROM public.user_profile_roles upr
      JOIN public.role_permissions rp ON rp.role_id = upr.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE upr.user_id = _user_id AND p.module = _module AND p.action = _action
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_create_profile(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
  SELECT private.is_app_admin(_user_id) OR (
    private.is_approved(_user_id) AND EXISTS (
      SELECT 1 FROM public.user_profile_roles upr
      JOIN public.role_permissions rp ON rp.role_id = upr.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE upr.user_id = _user_id AND p.module = 'perfis' AND p.action = 'criar'
    )
  );
$$;

-- Cadastro: super admin nasce aprovado e admin; os demais ficam pendentes
CREATE OR REPLACE FUNCTION public.ensure_app_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  mail text := coalesce(auth.jwt() ->> 'email', '');
  display text := coalesce(auth.jwt() -> 'user_metadata' ->> 'name', split_part(coalesce(auth.jwt() ->> 'email',''), '@', 1));
  admin_role uuid;
  is_super boolean;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  is_super := lower(mail) = private.super_admin_email();

  INSERT INTO public.app_users (id, email, name, status)
  VALUES (uid, mail, display, CASE WHEN is_super THEN 'aprovado' ELSE 'pendente' END)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF is_super THEN
    UPDATE public.app_users SET status = 'aprovado' WHERE id = uid AND status <> 'aprovado';
    DELETE FROM public.user_invites WHERE lower(email) = lower(mail);
    SELECT id INTO admin_role FROM public.roles WHERE is_admin LIMIT 1;
    INSERT INTO public.user_profile_roles (user_id, profile_id, role_id)
    VALUES (uid, NULL, admin_role)
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  IF (SELECT status FROM public.app_users WHERE id = uid) = 'aprovado' THEN
    DELETE FROM public.user_invites WHERE lower(email) = lower(mail);
  END IF;
END;
$$;

-- So o super admin decide aprovacoes; ninguem bloqueia o super admin
CREATE OR REPLACE FUNCTION public.protect_approval_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF private.is_super_admin(OLD.id) AND NEW.status <> 'aprovado' THEN
      RAISE EXCEPTION 'O super administrador nao pode ser bloqueado.';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT private.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Somente o super administrador aprova cadastros.';
    END IF;
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_approval_status_trg
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_approval_status();

-- O super admin nunca perde o papel de admin nem a conta
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME = 'app_users' THEN
    IF private.is_super_admin(OLD.id) THEN
      RAISE EXCEPTION 'O super administrador nao pode ser removido.';
    END IF;
    RETURN OLD;
  END IF;
  IF private.is_super_admin(OLD.user_id)
     AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id = OLD.role_id AND r.is_admin) THEN
    RAISE EXCEPTION 'O super administrador nao pode ser rebaixado.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER protect_super_admin_roles_trg
  BEFORE UPDATE OR DELETE ON public.user_profile_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

CREATE TRIGGER protect_super_admin_user_trg
  BEFORE DELETE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

-- Backfill: cadastros existentes ficam pendentes, exceto o super admin
UPDATE public.app_users au
  SET status = 'aprovado'
  WHERE lower(au.email) = private.super_admin_email();