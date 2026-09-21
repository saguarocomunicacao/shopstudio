-- 1) Seed de papéis padrão por tenant
CREATE OR REPLACE FUNCTION private.seed_tenant_defaults(p_tenant_id uuid, p_owner_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  template_tenant uuid := 'f7192d96-160f-4157-8599-eced5990bf8b'::uuid;
  tpl RECORD;
  new_role uuid;
  admin_role uuid;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN; END IF;

  FOR tpl IN
    SELECT id, name, description, is_system, is_admin
    FROM public.roles
    WHERE tenant_id = template_tenant
      AND is_system
      AND name IN ('Admin', 'Gerente', 'Criador', 'Revisor', 'Visualizador')
    ORDER BY name
  LOOP
    SELECT id INTO new_role FROM public.roles
     WHERE tenant_id = p_tenant_id AND name = tpl.name LIMIT 1;

    IF new_role IS NULL THEN
      INSERT INTO public.roles (name, description, is_system, is_admin, tenant_id)
      VALUES (tpl.name, tpl.description, tpl.is_system, tpl.is_admin, p_tenant_id)
      RETURNING id INTO new_role;
    END IF;

    -- Papel Admin herda tudo pelo is_admin; copiar permissões é bloqueado por trigger.
    -- Nenhum papel padrão pode receber permissão de backoffice.
    IF NOT tpl.is_admin THEN
      INSERT INTO public.role_permissions (role_id, permission_id, tenant_id)
      SELECT new_role, rp.permission_id, p_tenant_id
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = tpl.id
        AND p.module <> 'backoffice'
      ON CONFLICT DO NOTHING;
    END IF;

    IF tpl.is_admin THEN admin_role := new_role; END IF;
  END LOOP;

  IF p_owner_user_id IS NOT NULL AND admin_role IS NOT NULL THEN
    INSERT INTO public.user_profile_roles (user_id, profile_id, role_id, tenant_id)
    VALUES (p_owner_user_id, NULL, admin_role, p_tenant_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

-- 2) Signup cria tenant próprio
CREATE OR REPLACE FUNCTION public.ensure_app_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  uid uuid := auth.uid();
  mail text := coalesce(auth.jwt() ->> 'email', '');
  display text := coalesce(auth.jwt() -> 'user_metadata' ->> 'name', split_part(coalesce(auth.jwt() ->> 'email',''), '@', 1));
  admin_role uuid;
  is_super boolean;
  existing_tenant uuid;
  new_tenant uuid;
  saguaro_tenant uuid := 'f7192d96-160f-4157-8599-eced5990bf8b'::uuid;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  is_super := lower(mail) = private.super_admin_email();

  SELECT tenant_id INTO existing_tenant FROM public.app_users WHERE id = uid;

  IF existing_tenant IS NULL THEN
    IF is_super THEN
      new_tenant := saguaro_tenant;
    ELSE
      INSERT INTO public.tenants (name)
      VALUES (nullif(split_part(mail, '@', 1), ''))
      RETURNING id INTO new_tenant;
    END IF;

    INSERT INTO public.app_users (id, email, name, status, tenant_id)
    VALUES (uid, mail, display, CASE WHEN is_super THEN 'aprovado' ELSE 'pendente' END, new_tenant)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    IF NOT is_super THEN
      PERFORM private.seed_tenant_defaults(new_tenant, uid);
    END IF;
  ELSE
    UPDATE public.app_users SET email = mail WHERE id = uid AND email IS DISTINCT FROM mail;
  END IF;

  IF is_super THEN
    UPDATE public.app_users SET status = 'aprovado' WHERE id = uid AND status <> 'aprovado';
    DELETE FROM public.user_invites WHERE lower(email) = lower(mail);
    SELECT id INTO admin_role FROM public.roles WHERE is_admin AND tenant_id = saguaro_tenant LIMIT 1;
    INSERT INTO public.user_profile_roles (user_id, profile_id, role_id, tenant_id)
    VALUES (uid, NULL, admin_role, saguaro_tenant)
    ON CONFLICT DO NOTHING;
    RETURN;
  END IF;

  IF (SELECT status FROM public.app_users WHERE id = uid) = 'aprovado' THEN
    DELETE FROM public.user_invites WHERE lower(email) = lower(mail);
  END IF;
END;
$function$;

-- 4) Fallback vira erro
CREATE OR REPLACE FUNCTION public.default_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE t uuid;
BEGIN
  t := private.current_tenant_id();
  IF t IS NULL THEN
    RAISE EXCEPTION 'tenant_id nao resolvido no insert';
  END IF;
  RETURN t;
END;
$function$;