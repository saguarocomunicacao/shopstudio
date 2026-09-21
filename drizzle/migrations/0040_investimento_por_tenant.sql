ALTER TABLE public.fornecedor_aportes
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

UPDATE public.fornecedor_aportes
  SET tenant_id = 'f7192d96-160f-4157-8599-eced5990bf8b'::uuid
  WHERE tenant_id IS NULL;

ALTER TABLE public.fornecedor_aportes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.fornecedor_aportes ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
CREATE INDEX fornecedor_aportes_tenant_idx ON public.fornecedor_aportes (tenant_id);

ALTER TABLE public.fornecedor_planos
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

UPDATE public.fornecedor_planos
  SET tenant_id = 'f7192d96-160f-4157-8599-eced5990bf8b'::uuid
  WHERE tenant_id IS NULL;

ALTER TABLE public.fornecedor_planos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.fornecedor_planos ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id();
ALTER TABLE public.fornecedor_planos DROP CONSTRAINT IF EXISTS fornecedor_planos_pkey;
ALTER TABLE public.fornecedor_planos ADD CONSTRAINT fornecedor_planos_pkey PRIMARY KEY (tenant_id, fornecedor);

DROP POLICY IF EXISTS fornecedor_aportes_select ON public.fornecedor_aportes;
DROP POLICY IF EXISTS fornecedor_aportes_write ON public.fornecedor_aportes;

CREATE POLICY fornecedor_aportes_select ON public.fornecedor_aportes
  FOR SELECT TO authenticated
  USING (
    private.tenant_ok(tenant_id)
    AND (private.is_backoffice(auth.uid()) OR private.has_permission(auth.uid(), NULL, 'investimento', 'visualizar'))
  );

CREATE POLICY fornecedor_aportes_write ON public.fornecedor_aportes
  FOR ALL TO authenticated
  USING (
    private.tenant_ok(tenant_id)
    AND (private.is_backoffice(auth.uid()) OR private.has_permission(auth.uid(), NULL, 'investimento', 'visualizar'))
  )
  WITH CHECK (
    (private.is_super_admin(auth.uid()) OR tenant_id = private.current_tenant_id())
    AND (private.is_backoffice(auth.uid()) OR private.has_permission(auth.uid(), NULL, 'investimento', 'visualizar'))
  );

DROP POLICY IF EXISTS fornecedor_planos_select ON public.fornecedor_planos;
DROP POLICY IF EXISTS fornecedor_planos_write ON public.fornecedor_planos;

CREATE POLICY fornecedor_planos_select ON public.fornecedor_planos
  FOR SELECT TO authenticated
  USING (
    private.tenant_ok(tenant_id)
    AND (private.is_backoffice(auth.uid()) OR private.has_permission(auth.uid(), NULL, 'investimento', 'visualizar'))
  );

CREATE POLICY fornecedor_planos_write ON public.fornecedor_planos
  FOR ALL TO authenticated
  USING (
    private.tenant_ok(tenant_id)
    AND (private.is_backoffice(auth.uid()) OR private.has_permission(auth.uid(), NULL, 'investimento', 'visualizar'))
  )
  WITH CHECK (
    (private.is_super_admin(auth.uid()) OR tenant_id = private.current_tenant_id())
    AND (private.is_backoffice(auth.uid()) OR private.has_permission(auth.uid(), NULL, 'investimento', 'visualizar'))
  );