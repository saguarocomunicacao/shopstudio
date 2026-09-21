DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans
  FOR SELECT TO authenticated
  USING (
    private.is_backoffice(auth.uid())
    OR id = (
      SELECT t.plan_id
      FROM public.tenants t
      WHERE t.id = private.current_tenant_id()
    )
  );