GRANT UPDATE ON public.tenants TO authenticated;

DROP POLICY IF EXISTS tenants_select_scoped ON public.tenants;
CREATE POLICY tenants_select_scoped ON public.tenants
  FOR SELECT TO authenticated
  USING (private.is_backoffice(auth.uid()) OR id = private.current_tenant_id());

DROP POLICY IF EXISTS tenants_write_super_admin ON public.tenants;
CREATE POLICY tenants_write_backoffice ON public.tenants
  FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid()))
  WITH CHECK (private.is_backoffice(auth.uid()));

DROP POLICY IF EXISTS plans_insert ON public.plans;
DROP POLICY IF EXISTS plans_update ON public.plans;
DROP POLICY IF EXISTS plans_delete ON public.plans;
CREATE POLICY plans_insert ON public.plans FOR INSERT TO authenticated
  WITH CHECK (private.is_backoffice(auth.uid()));
CREATE POLICY plans_update ON public.plans FOR UPDATE TO authenticated
  USING (private.is_backoffice(auth.uid()))
  WITH CHECK (private.is_backoffice(auth.uid()));
CREATE POLICY plans_delete ON public.plans FOR DELETE TO authenticated
  USING (private.is_backoffice(auth.uid()));

DROP POLICY IF EXISTS plan_action_prices_write ON public.plan_action_prices;
CREATE POLICY plan_action_prices_write ON public.plan_action_prices
  FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid()))
  WITH CHECK (private.is_backoffice(auth.uid()));

DROP POLICY IF EXISTS app_users_select ON public.app_users;
CREATE POLICY app_users_select ON public.app_users FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR private.is_backoffice(auth.uid())
  OR (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()))
);

DROP POLICY IF EXISTS app_users_update ON public.app_users;
CREATE POLICY app_users_update ON public.app_users FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR private.is_backoffice(auth.uid())
  OR (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()))
)
WITH CHECK (
  id = auth.uid()
  OR private.is_backoffice(auth.uid())
  OR (private.tenant_ok(tenant_id) AND private.is_app_admin(auth.uid()))
);