-- Taxa de crédito/ponto por ação (substitui os literais fixos no código).
CREATE TABLE public.credito_taxas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL REFERENCES public.billable_actions(action_type),
  fornecedor text NOT NULL,
  credito_por_unidade numeric NOT NULL DEFAULT 0,
  regra text NOT NULL CHECK (regra IN ('por_chamada', 'por_bloco_100_linhas', 'por_segundo')),
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credito_taxas_lookup_idx ON public.credito_taxas (action_type, ativo, vigente_desde DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credito_taxas TO authenticated;
GRANT ALL ON public.credito_taxas TO service_role;

ALTER TABLE public.credito_taxas ENABLE ROW LEVEL SECURITY;

CREATE POLICY credito_taxas_select ON public.credito_taxas
  FOR SELECT TO authenticated
  USING (private.is_backoffice(auth.uid()));

CREATE POLICY credito_taxas_write_backoffice ON public.credito_taxas
  FOR ALL TO authenticated
  USING (private.is_backoffice(auth.uid()))
  WITH CHECK (private.is_backoffice(auth.uid()));

CREATE TRIGGER credito_taxas_set_updated_at
  BEFORE UPDATE ON public.credito_taxas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Consumo em crédito/ponto nativo do fornecedor, gravado junto do evento.
ALTER TABLE public.consumo_eventos
  ADD COLUMN credito_consumido numeric,
  ADD COLUMN credito_unidade text,
  ADD COLUMN credito_origem text;
