-- =============== TABLES ===============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  niche text NOT NULL DEFAULT '',
  initials text NOT NULL DEFAULT '',
  followers integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Ativo',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_users_email_key ON public.app_users (lower(email));

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  UNIQUE (module, action)
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.user_profile_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX upr_user_profile_key ON public.user_profile_roles (user_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX upr_user_global_key ON public.user_profile_roles (user_id) WHERE profile_id IS NULL;

CREATE TABLE public.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_invites_email_key ON public.user_invites (lower(email));

-- =============== GRANTS ===============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invites TO authenticated;
GRANT ALL ON public.profiles, public.app_users, public.roles, public.permissions, public.role_permissions, public.user_profile_roles, public.user_invites TO service_role;

-- =============== SECURITY DEFINER HELPERS ===============
CREATE OR REPLACE FUNCTION public.is_app_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profile_roles upr
    JOIN public.roles r ON r.id = upr.role_id
    WHERE upr.user_id = _user_id AND r.is_admin
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _profile_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_app_admin(_user_id) OR EXISTS (
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

CREATE OR REPLACE FUNCTION public.admin_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT upr.user_id)::int
  FROM public.user_profile_roles upr
  JOIN public.roles r ON r.id = upr.role_id
  WHERE r.is_admin;
$$;

-- first sign-in bootstrap
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

  IF public.admin_count() = 0 THEN
    SELECT id INTO admin_role FROM public.roles WHERE is_admin LIMIT 1;
    INSERT INTO public.user_profile_roles (user_id, profile_id, role_id)
    VALUES (uid, NULL, admin_role)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- =============== PROTECTION TRIGGERS ===============
CREATE OR REPLACE FUNCTION public.protect_admin_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_admin THEN
    RAISE EXCEPTION 'O papel Admin nao pode ser editado nem removido.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER protect_admin_role_trg BEFORE UPDATE OR DELETE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_role();

CREATE OR REPLACE FUNCTION public.protect_admin_role_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.role_id ELSE NEW.role_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = rid AND is_admin) THEN
    RAISE EXCEPTION 'As permissoes do papel Admin nao podem ser alteradas.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER protect_admin_role_permissions_trg BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_role_permissions();

CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE id = OLD.role_id AND is_admin) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profile_roles upr
      JOIN public.roles r ON r.id = upr.role_id
      WHERE r.is_admin AND upr.user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'Sempre deve existir ao menos um administrador.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER protect_last_admin_trg BEFORE UPDATE OR DELETE ON public.user_profile_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- =============== RLS ===============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), id, 'perfis', 'visualizar'));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.is_app_admin(auth.uid()));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), id, 'perfis', 'editar'))
WITH CHECK (public.has_permission(auth.uid(), id, 'perfis', 'editar'));
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
USING (public.is_app_admin(auth.uid()));

CREATE POLICY "app_users_select" ON public.app_users FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_app_admin(auth.uid()));
CREATE POLICY "app_users_update_self" ON public.app_users FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_app_admin(auth.uid()))
WITH CHECK (id = auth.uid() OR public.is_app_admin(auth.uid()));
CREATE POLICY "app_users_delete_admin" ON public.app_users FOR DELETE TO authenticated
USING (public.is_app_admin(auth.uid()));

CREATE POLICY "roles_select" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_write" ON public.roles FOR ALL TO authenticated
USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "permissions_select" ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "role_permissions_select" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_write" ON public.role_permissions FOR ALL TO authenticated
USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "upr_select" ON public.user_profile_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_app_admin(auth.uid()));
CREATE POLICY "upr_write" ON public.user_profile_roles FOR ALL TO authenticated
USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "invites_admin" ON public.user_invites FOR ALL TO authenticated
USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

-- =============== SEED ===============
INSERT INTO public.profiles (slug, name, niche, initials, followers, status) VALUES
  ('moda', 'Moda e Acessórios', 'Looks & tendências', 'MA', 128400, 'Ativo'),
  ('beleza', 'Beleza', 'Skincare & make', 'BZ', 94200, 'Ativo'),
  ('casa', 'Casa e Decoração', 'Casa prática', 'CD', 76300, 'Ativo'),
  ('eletronicos', 'Eletrônicos', 'Tecnologia acessível', 'EL', 63800, 'Pausado'),
  ('hobby', 'Hobby/Gadgets', 'Achados criativos', 'HG', 51700, 'Ativo');

INSERT INTO public.permissions (module, action)
SELECT m, a FROM unnest(ARRAY['perfis','produtos','pipeline','videos','rascunhos','metricas','equipe','configuracoes']) m
CROSS JOIN unnest(ARRAY['visualizar','criar','editar','remover','publicar','aprovar']) a;

INSERT INTO public.roles (name, description, is_system, is_admin) VALUES
  ('Admin', 'Acesso total a todos os módulos e perfis. Papel travado.', true, true),
  ('Gerente', 'Todas as ações em todos os módulos do perfil, exceto Equipe.', true, false),
  ('Criador', 'Cria e edita vídeos, pipeline e rascunhos. Não publica nem remove.', true, false),
  ('Revisor', 'Revisa, aprova e publica rascunhos.', true, false),
  ('Visualizador', 'Apenas visualização.', true, false);

-- Admin: all permissions (insert before trigger guard applies? guard blocks it, so temporarily disable)
ALTER TABLE public.role_permissions DISABLE TRIGGER protect_admin_role_permissions_trg;
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.name = 'Admin';
ALTER TABLE public.role_permissions ENABLE TRIGGER protect_admin_role_permissions_trg;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Gerente' AND p.module <> 'equipe';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Criador' AND (
  (p.module = 'videos' AND p.action IN ('visualizar','criar','editar')) OR
  (p.module = 'pipeline' AND p.action IN ('visualizar','criar','editar')) OR
  (p.module = 'produtos' AND p.action = 'visualizar') OR
  (p.module = 'rascunhos' AND p.action IN ('visualizar','criar')) OR
  (p.module = 'metricas' AND p.action = 'visualizar')
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Revisor' AND (
  (p.module = 'rascunhos' AND p.action IN ('visualizar','aprovar','publicar')) OR
  (p.module = 'videos' AND p.action = 'visualizar') OR
  (p.module = 'pipeline' AND p.action = 'visualizar') OR
  (p.module = 'metricas' AND p.action = 'visualizar')
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Visualizador' AND p.action = 'visualizar'
  AND p.module IN ('perfis','produtos','pipeline','videos','rascunhos','metricas');