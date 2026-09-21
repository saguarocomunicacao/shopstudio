-- Catálogo de ações cobráveis da ferramenta.
CREATE TABLE public.billable_actions (
  action_type text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.billable_actions TO authenticated;
GRANT ALL ON public.billable_actions TO service_role;

ALTER TABLE public.billable_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY billable_actions_select ON public.billable_actions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY billable_actions_write ON public.billable_actions
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.billable_actions (action_type, label, sort_order) VALUES
  ('roteiro', 'Geração de roteiro', 10),
  ('descricao_produto', 'Descrição de produto por IA', 20),
  ('transcricao', 'Ditado / transcrição por voz', 30),
  ('cena', 'Geração de cena (imagem)', 40),
  ('video', 'Geração de vídeo (animação)', 50),
  ('montagem', 'Montagem final do vídeo', 60),
  ('narracao', 'Geração de narração', 70),
  ('clonagem_voz', 'Clonagem de voz', 80),
  ('busca_produto', 'Busca / garimpo de produtos', 90),
  ('atualizacao_produto', 'Atualização de dados de produto', 100),
  ('videos_campeoes', 'Vídeos campeões', 110),
  ('atualizacao_categorias', 'Atualização de categorias', 120);

-- Preço da ferramenta por ação, definido em cada plano (centavos de R$).
CREATE TABLE public.plan_action_prices (
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  action_type text NOT NULL REFERENCES public.billable_actions(action_type) ON DELETE CASCADE,
  price_cents integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, action_type)
);

GRANT SELECT ON public.plan_action_prices TO authenticated;
GRANT ALL ON public.plan_action_prices TO service_role;

ALTER TABLE public.plan_action_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_action_prices_select ON public.plan_action_prices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY plan_action_prices_write ON public.plan_action_prices
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE INDEX plan_action_prices_plan_idx ON public.plan_action_prices (plan_id);

-- Todos os planos existentes nascem com preço 0 em todas as ações.
INSERT INTO public.plan_action_prices (plan_id, action_type, price_cents)
SELECT p.id, a.action_type, 0
FROM public.plans p
CROSS JOIN public.billable_actions a
ON CONFLICT DO NOTHING;

-- Snapshot da cobrança em cada evento de consumo.
ALTER TABLE public.consumo_eventos
  ADD COLUMN action_type text REFERENCES public.billable_actions(action_type),
  ADD COLUMN tool_price_cents integer NOT NULL DEFAULT 0;

CREATE INDEX consumo_eventos_action_type_idx ON public.consumo_eventos (action_type);

COMMENT ON COLUMN public.consumo_eventos.tool_price_cents IS
  'Snapshot do preço da ferramenta (plan_action_prices) no momento do evento. Nunca recalcular.';

COMMENT ON COLUMN public.plans.billing_model IS 'DEPRECATED: a fonte de preço é plan_action_prices.';
COMMENT ON COLUMN public.plans.price_cents IS 'DEPRECATED: a fonte de preço é plan_action_prices.';
COMMENT ON COLUMN public.plans.fallback_cap_cents IS 'DEPRECATED: a fonte de preço é plan_action_prices.';