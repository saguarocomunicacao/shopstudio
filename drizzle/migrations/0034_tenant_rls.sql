-- Etapa 1c: isolamento por tenant somado ao RBAC existente.

CREATE OR REPLACE FUNCTION private.tenant_ok(_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT private.is_super_admin(auth.uid()) OR (_tenant IS NOT NULL AND _tenant = private.current_tenant_id());
$$;

-- roles: unicidade de nome por tenant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='roles_name_key') THEN
    EXECUTE 'DROP INDEX public.roles_name_key';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_name_key ON public.roles (tenant_id, name);

-- profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), id, 'perfis', 'visualizar'));
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND private.can_create_profile(auth.uid()));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), id, 'perfis', 'editar'))
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), id, 'perfis', 'editar'));
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()));

-- products
DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_global_permission(auth.uid(), 'produtos', 'visualizar'));
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_global_permission(auth.uid(), 'produtos', 'criar'));
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_global_permission(auth.uid(), 'produtos', 'editar'))
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_global_permission(auth.uid(), 'produtos', 'editar'));
DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_global_permission(auth.uid(), 'produtos', 'remover'));

-- profile_identities
DROP POLICY IF EXISTS profile_identities_select ON public.profile_identities;
CREATE POLICY profile_identities_select ON public.profile_identities FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar'));
DROP POLICY IF EXISTS profile_identities_insert ON public.profile_identities;
CREATE POLICY profile_identities_insert ON public.profile_identities FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
DROP POLICY IF EXISTS profile_identities_update ON public.profile_identities;
CREATE POLICY profile_identities_update ON public.profile_identities FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'))
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

-- profile_video_settings
DROP POLICY IF EXISTS pvs_select ON public.profile_video_settings;
CREATE POLICY pvs_select ON public.profile_video_settings FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar'));
DROP POLICY IF EXISTS pvs_insert ON public.profile_video_settings;
CREATE POLICY pvs_insert ON public.profile_video_settings FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
DROP POLICY IF EXISTS pvs_update ON public.profile_video_settings;
CREATE POLICY pvs_update ON public.profile_video_settings FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'))
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

-- profile_prompt_overrides
DROP POLICY IF EXISTS ppo_select ON public.profile_prompt_overrides;
CREATE POLICY ppo_select ON public.profile_prompt_overrides FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar'));
DROP POLICY IF EXISTS ppo_insert ON public.profile_prompt_overrides;
CREATE POLICY ppo_insert ON public.profile_prompt_overrides FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
DROP POLICY IF EXISTS ppo_update ON public.profile_prompt_overrides;
CREATE POLICY ppo_update ON public.profile_prompt_overrides FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'))
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));
DROP POLICY IF EXISTS ppo_delete ON public.profile_prompt_overrides;
CREATE POLICY ppo_delete ON public.profile_prompt_overrides FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'perfis', 'editar'));

-- jobs
DROP POLICY IF EXISTS jobs_select ON public.jobs;
CREATE POLICY jobs_select ON public.jobs FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'pipeline', 'visualizar'));
DROP POLICY IF EXISTS jobs_insert ON public.jobs;
CREATE POLICY jobs_insert ON public.jobs FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'pipeline', 'criar'));
DROP POLICY IF EXISTS jobs_update ON public.jobs;
CREATE POLICY jobs_update ON public.jobs FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'pipeline', 'editar'))
WITH CHECK (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'pipeline', 'editar'));
DROP POLICY IF EXISTS jobs_delete ON public.jobs;
CREATE POLICY jobs_delete ON public.jobs FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'pipeline', 'remover'));

-- job_stage_events
DROP POLICY IF EXISTS job_stage_events_select ON public.job_stage_events;
CREATE POLICY job_stage_events_select ON public.job_stage_events FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'pipeline', 'visualizar'));

-- job_shares
DROP POLICY IF EXISTS "Quem enxerga o job enxerga os links" ON public.job_shares;
CREATE POLICY "Quem enxerga o job enxerga os links" ON public.job_shares FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_shares.job_id));
DROP POLICY IF EXISTS "Quem edita o pipeline cria links" ON public.job_shares;
CREATE POLICY "Quem edita o pipeline cria links" ON public.job_shares FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_shares.job_id AND public.can_edit_pipeline(j.profile_id)));
DROP POLICY IF EXISTS "Quem edita o pipeline revoga links" ON public.job_shares;
CREATE POLICY "Quem edita o pipeline revoga links" ON public.job_shares FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_shares.job_id AND public.can_edit_pipeline(j.profile_id)))
WITH CHECK (private.tenant_ok(tenant_id) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_shares.job_id AND public.can_edit_pipeline(j.profile_id)));
DROP POLICY IF EXISTS "Quem edita o pipeline apaga links" ON public.job_shares;
CREATE POLICY "Quem edita o pipeline apaga links" ON public.job_shares FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_shares.job_id AND public.can_edit_pipeline(j.profile_id)));

-- tiktok_connections
DROP POLICY IF EXISTS "Ver conexões dos perfis permitidos" ON public.tiktok_connections;
CREATE POLICY "Ver conexões dos perfis permitidos" ON public.tiktok_connections FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND public.can_view_profile(profile_id));
DROP POLICY IF EXISTS "Gerenciar conexões dos perfis editáveis" ON public.tiktok_connections;
CREATE POLICY "Gerenciar conexões dos perfis editáveis" ON public.tiktok_connections FOR ALL TO authenticated
USING (private.tenant_ok(tenant_id) AND public.can_edit_profile(profile_id))
WITH CHECK (private.tenant_ok(tenant_id) AND public.can_edit_profile(profile_id));

-- consumo_eventos
DROP POLICY IF EXISTS consumo_eventos_select ON public.consumo_eventos;
CREATE POLICY consumo_eventos_select ON public.consumo_eventos FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND (private.is_backoffice(auth.uid()) OR (profile_id IS NOT NULL AND private.has_permission(auth.uid(), profile_id, 'custos', 'visualizar'))));

-- voices
DROP POLICY IF EXISTS voices_select_owner ON public.voices;
CREATE POLICY voices_select_owner ON public.voices FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND (owner_id IS NULL OR owner_id = auth.uid() OR private.is_backoffice(auth.uid())));
DROP POLICY IF EXISTS voices_insert_owner ON public.voices;
CREATE POLICY voices_insert_owner ON public.voices FOR INSERT TO authenticated
WITH CHECK (private.tenant_ok(tenant_id) AND (owner_id = auth.uid() OR private.is_backoffice(auth.uid())));
DROP POLICY IF EXISTS voices_update_owner ON public.voices;
CREATE POLICY voices_update_owner ON public.voices FOR UPDATE TO authenticated
USING (private.tenant_ok(tenant_id) AND (owner_id = auth.uid() OR private.is_backoffice(auth.uid())))
WITH CHECK (private.tenant_ok(tenant_id) AND (owner_id = auth.uid() OR private.is_backoffice(auth.uid())));
DROP POLICY IF EXISTS voices_delete_owner ON public.voices;
CREATE POLICY voices_delete_owner ON public.voices FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND (owner_id = auth.uid() OR private.is_backoffice(auth.uid())));

-- user_profile_roles
DROP POLICY IF EXISTS upr_select ON public.user_profile_roles;
CREATE POLICY upr_select ON public.user_profile_roles FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND (user_id = auth.uid() OR private.is_app_admin(auth.uid())));
DROP POLICY IF EXISTS upr_write ON public.user_profile_roles;
CREATE POLICY upr_write ON public.user_profile_roles FOR ALL TO authenticated
USING (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()))
WITH CHECK (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()));

-- roles
DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND (private.is_app_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_profile_roles upr WHERE upr.user_id = auth.uid() AND upr.role_id = roles.id)));
DROP POLICY IF EXISTS roles_write ON public.roles;
CREATE POLICY roles_write ON public.roles FOR ALL TO authenticated
USING (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()))
WITH CHECK (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()));

-- role_permissions
DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated
USING (private.tenant_ok(tenant_id) AND (private.is_app_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_profile_roles upr WHERE upr.user_id = auth.uid() AND upr.role_id = role_permissions.role_id)));
DROP POLICY IF EXISTS role_permissions_write ON public.role_permissions;
CREATE POLICY role_permissions_write ON public.role_permissions FOR ALL TO authenticated
USING (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()))
WITH CHECK (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()));

-- app_users
DROP POLICY IF EXISTS app_users_select ON public.app_users;
CREATE POLICY app_users_select ON public.app_users FOR SELECT TO authenticated
USING (id = auth.uid() OR (private.tenant_ok(tenant_id) AND (private.is_backoffice(auth.uid()) OR private.is_app_admin(auth.uid()))));
DROP POLICY IF EXISTS app_users_update ON public.app_users;
CREATE POLICY app_users_update ON public.app_users FOR UPDATE TO authenticated
USING (id = auth.uid() OR (private.tenant_ok(tenant_id) AND (private.is_backoffice(auth.uid()) OR private.is_app_admin(auth.uid()))))
WITH CHECK (id = auth.uid() OR (private.tenant_ok(tenant_id) AND (private.is_backoffice(auth.uid()) OR private.is_app_admin(auth.uid()))));
DROP POLICY IF EXISTS app_users_delete_backoffice ON public.app_users;
CREATE POLICY app_users_delete_backoffice ON public.app_users FOR DELETE TO authenticated
USING (private.tenant_ok(tenant_id) AND (private.is_backoffice(auth.uid()) OR private.is_app_admin(auth.uid())));
