-- Enums de unidade e etapa de consumo
CREATE TYPE public.unidade_tarifa AS ENUM ('imagem', 'segundo_video', 'credito_montagem', 'bloco_linhas_kalodata');
CREATE TYPE public.moeda_tarifa AS ENUM ('USD', 'BRL');
CREATE TYPE public.etapa_consumo AS ENUM ('cena_gemini', 'animacao_veo', 'montagem_json2video', 'busca_kalodata');

-- Tabela de tarifas (preço por unidade, com vigência)
CREATE TABLE public.tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_unidade public.unidade_tarifa NOT NULL,
  modelo text NOT NULL,
  preco_unitario numeric(14,6) NOT NULL DEFAULT 0,
  moeda public.moeda_tarifa NOT NULL DEFAULT 'USD',
  vigente_desde date NOT NULL DEFAULT current_date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tarifas_lookup_idx ON public.tarifas (tipo_unidade, modelo, vigente_desde DESC);

GRANT SELECT ON public.tarifas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tarifas TO authenticated;
GRANT ALL ON public.tarifas TO service_role;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tarifas_select ON public.tarifas FOR SELECT TO authenticated USING (true);
CREATE POLICY tarifas_write_admin ON public.tarifas FOR ALL TO authenticated
  USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

CREATE TRIGGER tarifas_updated_at BEFORE UPDATE ON public.tarifas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Configuração global numérica (ex.: cotação USD -> BRL)
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value_num numeric(14,6),
  value_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT INSERT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_config_select ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY app_config_write_admin ON public.app_config FOR ALL TO authenticated
  USING (private.is_app_admin(auth.uid())) WITH CHECK (private.is_app_admin(auth.uid()));

CREATE TRIGGER app_config_updated_at BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Log append-only de consumo real
CREATE TABLE public.consumo_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  etapa public.etapa_consumo NOT NULL,
  modelo text NOT NULL DEFAULT '',
  quantidade numeric(14,4),
  unidade public.unidade_tarifa NOT NULL,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consumo_eventos_job_idx ON public.consumo_eventos (job_id);
CREATE INDEX consumo_eventos_profile_idx ON public.consumo_eventos (profile_id, created_at DESC);

GRANT SELECT ON public.consumo_eventos TO authenticated;
GRANT ALL ON public.consumo_eventos TO service_role;
ALTER TABLE public.consumo_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY consumo_eventos_select ON public.consumo_eventos FOR SELECT TO authenticated
  USING (private.is_app_admin(auth.uid())
      OR private.has_permission(auth.uid(), profile_id, 'pipeline', 'visualizar'));
