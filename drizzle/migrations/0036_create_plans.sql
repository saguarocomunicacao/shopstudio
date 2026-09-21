CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_source text NOT NULL CHECK (key_source IN ('shop_studio','byok')),
  billing_model text NOT NULL CHECK (billing_model IN ('gratuito','por_video','mensal')),
  price_cents integer NOT NULL DEFAULT 0,
  fallback_cap_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY plans_insert ON public.plans FOR INSERT TO authenticated WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY plans_update ON public.plans FOR UPDATE TO authenticated USING (private.is_super_admin(auth.uid())) WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY plans_delete ON public.plans FOR DELETE TO authenticated USING (private.is_super_admin(auth.uid()));

CREATE UNIQUE INDEX plans_name_key ON public.plans (name);

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenants_plan_id_idx ON public.tenants (plan_id);

INSERT INTO public.plans (name, key_source, billing_model, price_cents, fallback_cap_cents, is_active) VALUES
  ('Saguaro (interno)', 'shop_studio', 'gratuito', 0, 0, true),
  ('Parceiro BYOK', 'byok', 'gratuito', 0, 0, true),
  ('Novo (pendente)', 'shop_studio', 'gratuito', 0, 0, true),
  ('Pro por vídeo', 'shop_studio', 'por_video', 1000, 0, true);

UPDATE public.tenants
  SET plan_id = (SELECT id FROM public.plans WHERE name = 'Saguaro (interno)')
  WHERE name = 'Saguaro';

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
  default_plan uuid;
  saguaro_tenant uuid := 'f7192d96-160f-4157-8599-eced5990bf8b'::uuid;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  is_super := lower(mail) = private.super_admin_email();

  SELECT tenant_id INTO existing_tenant FROM public.app_users WHERE id = uid;

  IF existing_tenant IS NULL THEN
    IF is_super THEN
      new_tenant := saguaro_tenant;
    ELSE
      SELECT id INTO default_plan FROM public.plans WHERE name = 'Novo (pendente)' LIMIT 1;
      INSERT INTO public.tenants (name, plan_id)
      VALUES (nullif(split_part(mail, '@', 1), ''), default_plan)
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