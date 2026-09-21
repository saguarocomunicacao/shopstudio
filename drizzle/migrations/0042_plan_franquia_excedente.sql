ALTER TABLE public.plan_action_prices
  ADD COLUMN IF NOT EXISTS included_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_price_cents integer NOT NULL DEFAULT 0;

UPDATE public.plan_action_prices SET unit_price_cents = price_cents WHERE unit_price_cents = 0;

COMMENT ON COLUMN public.plan_action_prices.price_cents IS 'DEPRECATED: substituido por unit_price_cents / overage_price_cents / included_qty';
COMMENT ON COLUMN public.plans.billing_model IS 'DEPRECATED: o modelo de cobranca agora e a matriz plan_action_prices';
COMMENT ON COLUMN public.plans.price_cents IS 'DEPRECATED: o modelo de cobranca agora e a matriz plan_action_prices';
COMMENT ON COLUMN public.plans.fallback_cap_cents IS 'DEPRECATED: nao usado no modelo por acao';

ALTER TABLE public.consumo_eventos
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'unitario';

COMMENT ON COLUMN public.consumo_eventos.billing_mode IS 'unitario | incluido | excedente';