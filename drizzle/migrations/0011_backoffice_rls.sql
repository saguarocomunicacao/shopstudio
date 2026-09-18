-- Conceito de BACKOFFICE: super admin fixo + quem receber a permissao backoffice:visualizar.
-- Admin generico NAO entra aqui de proposito.
CREATE OR REPLACE FUNCTION private.is_backoffice(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
  SELECT private.is_super_admin(_user_id) OR (
    private.is_approved(_user_id) AND EXISTS (
      SELECT 1 FROM public.user_profile_roles upr
      JOIN public.role_permissions rp ON rp.role_id = upr.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE upr.user_id = _user_id AND p.module = 'backoffice' AND p.action = 'visualizar'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_backoffice()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_backoffice(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.is_backoffice() TO authenticated;

-- 1) Tarifas de custo: leitura fechada.
DROP POLICY IF EXISTS tarifas_select ON public.tarifas;
DROP POLICY IF EXISTS tarifas_write_admin ON public.tarifas;
CREATE POLICY tarifas_select ON public.tarifas FOR SELECT TO authenticated USING (private.is_backoffice(auth.uid()));
CREATE POLICY tarifas_write_backoffice ON public.tarifas FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid())) WITH CHECK (private.is_backoffice(auth.uid()));

-- 2) Orcamento / tetos / cotacao (app_config): leitura fechada.
DROP POLICY IF EXISTS app_config_select ON public.app_config;
DROP POLICY IF EXISTS app_config_write_admin ON public.app_config;
CREATE POLICY app_config_select ON public.app_config FOR SELECT TO authenticated USING (private.is_backoffice(auth.uid()));
CREATE POLICY app_config_write_backoffice ON public.app_config FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid())) WITH CHECK (private.is_backoffice(auth.uid()));

-- 3) Prompts padrao do sistema: corpo fechado; metadados ficam em uma view sem o texto.
DROP POLICY IF EXISTS prompt_templates_select ON public.prompt_templates;
DROP POLICY IF EXISTS prompt_templates_write_admin ON public.prompt_templates;
CREATE POLICY prompt_templates_select ON public.prompt_templates FOR SELECT TO authenticated USING (private.is_backoffice(auth.uid()));
CREATE POLICY prompt_templates_write_backoffice ON public.prompt_templates FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid())) WITH CHECK (private.is_backoffice(auth.uid()));

CREATE OR REPLACE VIEW public.prompt_templates_visible AS
  SELECT key, title, description, placeholders, sort_order,
         CASE WHEN private.is_backoffice(auth.uid()) THEN body ELSE '' END AS body
  FROM public.prompt_templates
  WHERE private.is_approved(auth.uid());
GRANT SELECT ON public.prompt_templates_visible TO authenticated;

-- 4) Investimento: aportes e planos somente backoffice.
DROP POLICY IF EXISTS fornecedor_aportes_select ON public.fornecedor_aportes;
DROP POLICY IF EXISTS fornecedor_aportes_write ON public.fornecedor_aportes;
CREATE POLICY fornecedor_aportes_select ON public.fornecedor_aportes FOR SELECT TO authenticated USING (private.is_backoffice(auth.uid()));
CREATE POLICY fornecedor_aportes_write ON public.fornecedor_aportes FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid())) WITH CHECK (private.is_backoffice(auth.uid()));

DROP POLICY IF EXISTS fornecedor_planos_select ON public.fornecedor_planos;
DROP POLICY IF EXISTS fornecedor_planos_write ON public.fornecedor_planos;
CREATE POLICY fornecedor_planos_select ON public.fornecedor_planos FOR SELECT TO authenticated USING (private.is_backoffice(auth.uid()));
CREATE POLICY fornecedor_planos_write ON public.fornecedor_planos FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid())) WITH CHECK (private.is_backoffice(auth.uid()));

-- 5) Eventos de consumo: global so backoffice; por perfil segue custos:visualizar.
DROP POLICY IF EXISTS consumo_eventos_select ON public.consumo_eventos;
CREATE POLICY consumo_eventos_select ON public.consumo_eventos FOR SELECT TO authenticated
  USING (
    private.is_backoffice(auth.uid())
    OR (profile_id IS NOT NULL AND private.has_permission(auth.uid(), profile_id, 'custos', 'visualizar'))
  );

-- 6) Usuarios da plataforma: leitura/escrita restrita ao proprio usuario e ao backoffice.
DROP POLICY IF EXISTS app_users_select ON public.app_users;
DROP POLICY IF EXISTS app_users_update_self ON public.app_users;
DROP POLICY IF EXISTS app_users_delete_admin ON public.app_users;
CREATE POLICY app_users_select ON public.app_users FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.is_backoffice(auth.uid()));
CREATE POLICY app_users_update ON public.app_users FOR UPDATE TO authenticated
  USING (id = auth.uid() OR private.is_backoffice(auth.uid()))
  WITH CHECK (id = auth.uid() OR private.is_backoffice(auth.uid()));
CREATE POLICY app_users_delete_backoffice ON public.app_users FOR DELETE TO authenticated
  USING (private.is_backoffice(auth.uid()));

-- 7) Vozes: leitura so para quem trabalha com perfis/pipeline.
DROP POLICY IF EXISTS voices_select ON public.voices;
CREATE POLICY voices_select ON public.voices FOR SELECT TO authenticated
  USING (
    private.is_backoffice(auth.uid())
    OR private.has_permission_any(auth.uid(), 'perfis', 'visualizar')
    OR private.has_permission_any(auth.uid(), 'pipeline', 'visualizar')
  );

-- 8) Papeis e vinculos: leitura so do que interessa ao proprio usuario, ou admin.
DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
  USING (
    private.is_app_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_profile_roles upr WHERE upr.user_id = auth.uid() AND upr.role_id = roles.id)
  );

DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated
  USING (
    private.is_app_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_profile_roles upr WHERE upr.user_id = auth.uid() AND upr.role_id = role_permissions.role_id)
  );