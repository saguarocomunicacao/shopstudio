ALTER TABLE public.plan_action_prices
  ALTER COLUMN included_qty SET DEFAULT 0,
  ALTER COLUMN overage_price_cents SET DEFAULT 0;

COMMENT ON COLUMN public.plan_action_prices.unit_price_cents IS
  'Preco, em centavos de real, para comprar uma unidade da acao.';

COMMENT ON COLUMN public.plan_action_prices.included_qty IS
  'DEPRECATED: obsoleto desde o modelo de compra de quantidades sem expiracao; mantido temporariamente por compatibilidade.';

COMMENT ON COLUMN public.plan_action_prices.overage_price_cents IS
  'DEPRECATED: obsoleto desde o modelo de compra de quantidades sem expiracao; mantido temporariamente por compatibilidade.';