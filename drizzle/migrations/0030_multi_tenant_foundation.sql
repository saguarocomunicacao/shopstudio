-- 1. Tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_name_key ON public.tenants (lower(name));

GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select_authenticated ON public.tenants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tenants_write_super_admin ON public.tenants
  FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_super_admin(auth.uid()));

-- 2. Seed do tenant inicial
INSERT INTO public.tenants (name) VALUES ('Saguaro')
ON CONFLICT DO NOTHING;

-- 3. Coluna tenant_id (nullable)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.profile_identities ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.profile_video_settings ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.profile_prompt_overrides ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.job_stage_events ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.job_shares ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.tiktok_connections ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.tiktok_oauth_states ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.consumo_eventos ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.voices ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.user_profile_roles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- 4. Backfill (triggers de proteção/updated_at desligados para não alterar comportamento nem dados)
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.products DISABLE TRIGGER USER;
ALTER TABLE public.profile_identities DISABLE TRIGGER USER;
ALTER TABLE public.profile_video_settings DISABLE TRIGGER USER;
ALTER TABLE public.profile_prompt_overrides DISABLE TRIGGER USER;
ALTER TABLE public.jobs DISABLE TRIGGER USER;
ALTER TABLE public.job_stage_events DISABLE TRIGGER USER;
ALTER TABLE public.job_shares DISABLE TRIGGER USER;
ALTER TABLE public.tiktok_connections DISABLE TRIGGER USER;
ALTER TABLE public.tiktok_oauth_states DISABLE TRIGGER USER;
ALTER TABLE public.consumo_eventos DISABLE TRIGGER USER;
ALTER TABLE public.voices DISABLE TRIGGER USER;
ALTER TABLE public.user_profile_roles DISABLE TRIGGER USER;
ALTER TABLE public.roles DISABLE TRIGGER USER;
ALTER TABLE public.role_permissions DISABLE TRIGGER USER;
ALTER TABLE public.app_users DISABLE TRIGGER USER;

UPDATE public.profiles SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.products SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.profile_identities SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.profile_video_settings SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.profile_prompt_overrides SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.jobs SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.job_stage_events SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.job_shares SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.tiktok_connections SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.tiktok_oauth_states SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.consumo_eventos SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.voices SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.user_profile_roles SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.roles SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.role_permissions SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;
UPDATE public.app_users SET tenant_id = (SELECT id FROM public.tenants WHERE lower(name)='saguaro') WHERE tenant_id IS NULL;

ALTER TABLE public.profiles ENABLE TRIGGER USER;
ALTER TABLE public.products ENABLE TRIGGER USER;
ALTER TABLE public.profile_identities ENABLE TRIGGER USER;
ALTER TABLE public.profile_video_settings ENABLE TRIGGER USER;
ALTER TABLE public.profile_prompt_overrides ENABLE TRIGGER USER;
ALTER TABLE public.jobs ENABLE TRIGGER USER;
ALTER TABLE public.job_stage_events ENABLE TRIGGER USER;
ALTER TABLE public.job_shares ENABLE TRIGGER USER;
ALTER TABLE public.tiktok_connections ENABLE TRIGGER USER;
ALTER TABLE public.tiktok_oauth_states ENABLE TRIGGER USER;
ALTER TABLE public.consumo_eventos ENABLE TRIGGER USER;
ALTER TABLE public.voices ENABLE TRIGGER USER;
ALTER TABLE public.user_profile_roles ENABLE TRIGGER USER;
ALTER TABLE public.roles ENABLE TRIGGER USER;
ALTER TABLE public.role_permissions ENABLE TRIGGER USER;
ALTER TABLE public.app_users ENABLE TRIGGER USER;

-- 5. NOT NULL + FK + índices
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.profile_identities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.profile_video_settings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.profile_prompt_overrides ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.jobs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.job_stage_events ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.job_shares ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.tiktok_connections ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.tiktok_oauth_states ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.consumo_eventos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.voices ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.user_profile_roles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.roles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.role_permissions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.app_users ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.profile_identities ADD CONSTRAINT profile_identities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.profile_video_settings ADD CONSTRAINT profile_video_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.profile_prompt_overrides ADD CONSTRAINT profile_prompt_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.job_stage_events ADD CONSTRAINT job_stage_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.job_shares ADD CONSTRAINT job_shares_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.tiktok_connections ADD CONSTRAINT tiktok_connections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.tiktok_oauth_states ADD CONSTRAINT tiktok_oauth_states_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.consumo_eventos ADD CONSTRAINT consumo_eventos_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.voices ADD CONSTRAINT voices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.user_profile_roles ADD CONSTRAINT user_profile_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.roles ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
ALTER TABLE public.app_users ADD CONSTRAINT app_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx ON public.profiles (tenant_id);
CREATE INDEX IF NOT EXISTS products_tenant_id_idx ON public.products (tenant_id);
CREATE INDEX IF NOT EXISTS profile_identities_tenant_id_idx ON public.profile_identities (tenant_id);
CREATE INDEX IF NOT EXISTS profile_video_settings_tenant_id_idx ON public.profile_video_settings (tenant_id);
CREATE INDEX IF NOT EXISTS profile_prompt_overrides_tenant_id_idx ON public.profile_prompt_overrides (tenant_id);
CREATE INDEX IF NOT EXISTS jobs_tenant_id_idx ON public.jobs (tenant_id);
CREATE INDEX IF NOT EXISTS job_stage_events_tenant_id_idx ON public.job_stage_events (tenant_id);
CREATE INDEX IF NOT EXISTS job_shares_tenant_id_idx ON public.job_shares (tenant_id);
CREATE INDEX IF NOT EXISTS tiktok_connections_tenant_id_idx ON public.tiktok_connections (tenant_id);
CREATE INDEX IF NOT EXISTS tiktok_oauth_states_tenant_id_idx ON public.tiktok_oauth_states (tenant_id);
CREATE INDEX IF NOT EXISTS consumo_eventos_tenant_id_idx ON public.consumo_eventos (tenant_id);
CREATE INDEX IF NOT EXISTS voices_tenant_id_idx ON public.voices (tenant_id);
CREATE INDEX IF NOT EXISTS user_profile_roles_tenant_id_idx ON public.user_profile_roles (tenant_id);
CREATE INDEX IF NOT EXISTS roles_tenant_id_idx ON public.roles (tenant_id);
CREATE INDEX IF NOT EXISTS role_permissions_tenant_id_idx ON public.role_permissions (tenant_id);
CREATE INDEX IF NOT EXISTS app_users_tenant_id_idx ON public.app_users (tenant_id);

-- 6. Helper (ainda não usado em policies)
CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT au.tenant_id FROM public.app_users au WHERE au.id = auth.uid();
$$;