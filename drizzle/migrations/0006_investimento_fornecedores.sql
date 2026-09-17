CREATE TABLE public.fornecedor_aportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor text NOT NULL CHECK (fornecedor IN ('google','kalodata','json2video')),
  data date NOT NULL DEFAULT current_date,
  valor_brl numeric NOT NULL DEFAULT 0,
  unidades numeric,
  unidade text,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedor_aportes TO authenticated;
GRANT ALL ON public.fornecedor_aportes TO service_role;

ALTER TABLE public.fornecedor_aportes ENABLE ROW LEVEL SECURITY;

CREATE POLICY fornecedor_aportes_select ON public.fornecedor_aportes
FOR SELECT TO authenticated
USING (private.has_permission_any(auth.uid(), 'investimento', 'visualizar'));

CREATE POLICY fornecedor_aportes_write ON public.fornecedor_aportes
FOR ALL TO authenticated
USING (private.is_app_admin(auth.uid()) OR private.has_permission_any(auth.uid(), 'investimento', 'editar'))
WITH CHECK (private.is_app_admin(auth.uid()) OR private.has_permission_any(auth.uid(), 'investimento', 'editar'));

CREATE TABLE public.fornecedor_planos (
  fornecedor text PRIMARY KEY CHECK (fornecedor IN ('google','kalodata','json2video')),
  creditos_mes numeric NOT NULL DEFAULT 0,
  valor_mensal numeric NOT NULL DEFAULT 0,
  dia_renovacao integer NOT NULL DEFAULT 1 CHECK (dia_renovacao BETWEEN 1 AND 28),
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedor_planos TO authenticated;
GRANT ALL ON public.fornecedor_planos TO service_role;

ALTER TABLE public.fornecedor_planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY fornecedor_planos_select ON public.fornecedor_planos
FOR SELECT TO authenticated
USING (private.has_permission_any(auth.uid(), 'investimento', 'visualizar'));

CREATE POLICY fornecedor_planos_write ON public.fornecedor_planos
FOR ALL TO authenticated
USING (private.is_app_admin(auth.uid()) OR private.has_permission_any(auth.uid(), 'investimento', 'editar'))
WITH CHECK (private.is_app_admin(auth.uid()) OR private.has_permission_any(auth.uid(), 'investimento', 'editar'));

CREATE TRIGGER fornecedor_planos_updated_at
BEFORE UPDATE ON public.fornecedor_planos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions (module, action)
VALUES ('investimento','visualizar'), ('investimento','editar')
ON CONFLICT DO NOTHING;

INSERT INTO public.fornecedor_planos (fornecedor, creditos_mes, valor_mensal, dia_renovacao, ativo)
VALUES ('json2video', 0, 0, 1, true)
ON CONFLICT (fornecedor) DO NOTHING;