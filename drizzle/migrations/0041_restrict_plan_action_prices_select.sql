DROP POLICY IF EXISTS plan_action_prices_select ON public.plan_action_prices;

CREATE POLICY plan_action_prices_select ON public.plan_action_prices
FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR plan_id = (
    SELECT t.plan_id FROM public.tenants t
    WHERE t.id = private.current_tenant_id()
  )
);