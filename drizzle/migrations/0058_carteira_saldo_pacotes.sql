-- 1) Pacotes no catálogo de planos -------------------------------------------
ALTER TABLE public.plan_action_prices ADD COLUMN IF NOT EXISTS package_qty integer NOT NULL DEFAULT 1;
ALTER TABLE public.plan_action_prices ADD COLUMN IF NOT EXISTS package_price_cents integer NOT NULL DEFAULT 0;
UPDATE public.plan_action_prices SET package_price_cents = unit_price_cents WHERE package_price_cents = 0 AND unit_price_cents > 0;
COMMENT ON COLUMN public.plan_action_prices.unit_price_cents IS 'DEPRECATED: substituido por package_qty + package_price_cents';
COMMENT ON COLUMN public.plan_action_prices.included_qty IS 'DEPRECATED: modelo de franquia mensal removido';
COMMENT ON COLUMN public.plan_action_prices.overage_price_cents IS 'DEPRECATED: modelo de excedente removido';

-- 2) Carteira de saldo por tenant x acao --------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_action_balances (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type text NOT NULL REFERENCES public.billable_actions(action_type),
  saldo integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, action_type)
);
GRANT SELECT ON public.tenant_action_balances TO authenticated;
GRANT ALL ON public.tenant_action_balances TO service_role;
ALTER TABLE public.tenant_action_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_action_balances_select ON public.tenant_action_balances
  FOR SELECT TO authenticated
  USING (private.is_backoffice(auth.uid()) OR tenant_id = private.current_tenant_id());

CREATE TABLE IF NOT EXISTS public.wallet_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type text NOT NULL REFERENCES public.billable_actions(action_type),
  tipo text NOT NULL,
  quantidade integer NOT NULL,
  saldo_apos integer NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  descricao text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_movements_tenant_idx ON public.wallet_movements (tenant_id, created_at DESC);
GRANT SELECT ON public.wallet_movements TO authenticated;
GRANT ALL ON public.wallet_movements TO service_role;
ALTER TABLE public.wallet_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_movements_select ON public.wallet_movements
  FOR SELECT TO authenticated
  USING (private.is_backoffice(auth.uid()) OR tenant_id = private.current_tenant_id());

ALTER TABLE public.consumo_eventos ADD COLUMN IF NOT EXISTS wallet_movement_id uuid REFERENCES public.wallet_movements(id) ON DELETE SET NULL;

-- 3) Debito atomico ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_action_balance(_tenant uuid, _action text, _qty integer, _job uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE novo integer; mov uuid;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN RETURN NULL; END IF;

  INSERT INTO public.tenant_action_balances (tenant_id, action_type, saldo)
  VALUES (_tenant, _action, 0)
  ON CONFLICT (tenant_id, action_type) DO NOTHING;

  UPDATE public.tenant_action_balances
     SET saldo = saldo - _qty, updated_at = now()
   WHERE tenant_id = _tenant AND action_type = _action AND saldo >= _qty
  RETURNING saldo INTO novo;

  IF novo IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.wallet_movements (tenant_id, action_type, tipo, quantidade, saldo_apos, job_id, descricao)
  VALUES (_tenant, _action, 'debito', _qty, novo, _job, 'Consumo')
  RETURNING id INTO mov;
  RETURN mov;
END;
$$;
REVOKE ALL ON FUNCTION public.debit_action_balance(uuid, text, integer, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.debit_action_balance(uuid, text, integer, uuid) TO service_role;

-- 4) Credito manual de pacote (backoffice) ------------------------------------
CREATE OR REPLACE FUNCTION public.credit_action_packages(_tenant uuid, _action text, _packages integer, _descricao text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _qty integer; _price integer; total integer; valor integer; novo integer;
BEGIN
  IF NOT private.is_backoffice(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF _packages IS NULL OR _packages = 0 THEN RAISE EXCEPTION 'Informe a quantidade de pacotes.'; END IF;

  SELECT pap.package_qty, pap.package_price_cents INTO _qty, _price
    FROM public.tenants t
    JOIN public.plan_action_prices pap ON pap.plan_id = t.plan_id
   WHERE t.id = _tenant AND pap.action_type = _action;

  IF _qty IS NULL THEN RAISE EXCEPTION 'O plano desta empresa nao tem pacote para esta acao.'; END IF;

  total := _qty * _packages;
  valor := _price * _packages;

  INSERT INTO public.tenant_action_balances (tenant_id, action_type, saldo)
  VALUES (_tenant, _action, GREATEST(total, 0))
  ON CONFLICT (tenant_id, action_type)
  DO UPDATE SET saldo = GREATEST(public.tenant_action_balances.saldo + total, 0), updated_at = now()
  RETURNING saldo INTO novo;

  INSERT INTO public.wallet_movements (tenant_id, action_type, tipo, quantidade, saldo_apos, price_cents, descricao, created_by)
  VALUES (_tenant, _action, CASE WHEN total >= 0 THEN 'credito' ELSE 'debito' END, total, novo, valor,
          COALESCE(_descricao, 'Compra de pacote lancada pelo backoffice'), auth.uid());

  RETURN novo;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_action_packages(uuid, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_action_packages(uuid, text, integer, text) TO authenticated, service_role;