CREATE TABLE public.pesquisas_tiktok (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('hashtag','palavra')),
  termo text NOT NULL,
  qtd integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'coletando' CHECK (status IN ('coletando','processando','ok','erro')),
  run_id text,
  iniciado_em timestamptz,
  erro text,
  custo_usd numeric NOT NULL DEFAULT 0,
  n_videos integer NOT NULL DEFAULT 0,
  insights text,
  insights_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pesquisas_tiktok_perfil_idx ON public.pesquisas_tiktok(profile_id, created_at DESC);
GRANT SELECT ON public.pesquisas_tiktok TO authenticated;
GRANT ALL ON public.pesquisas_tiktok TO service_role;
ALTER TABLE public.pesquisas_tiktok ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver pesquisas" ON public.pesquisas_tiktok FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.pesquisas_tiktok_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pesquisa_id uuid NOT NULL REFERENCES public.pesquisas_tiktok(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  url text NOT NULL,
  legenda text,
  publicado_em timestamptz,
  duracao numeric,
  capa_path text,
  autor_handle text,
  autor_nome text,
  autor_seguidores bigint,
  views bigint,
  likes bigint,
  comentarios bigint,
  compartilhamentos bigint,
  salvos bigint,
  reposts bigint,
  hashtags text[] NOT NULL DEFAULT '{}',
  anuncio boolean NOT NULL DEFAULT false,
  fotos boolean NOT NULL DEFAULT false,
  tiktok_shop boolean NOT NULL DEFAULT false,
  idioma_pt boolean NOT NULL DEFAULT true,
  posicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pesquisa_id, tiktok_video_id)
);
GRANT SELECT ON public.pesquisas_tiktok_videos TO authenticated;
GRANT ALL ON public.pesquisas_tiktok_videos TO service_role;
ALTER TABLE public.pesquisas_tiktok_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver videos pesquisa" ON public.pesquisas_tiktok_videos FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

ALTER TABLE public.video_analises ADD COLUMN pesquisa_id uuid REFERENCES public.pesquisas_tiktok(id) ON DELETE SET NULL;
CREATE INDEX video_analises_pesquisa_idx ON public.video_analises(pesquisa_id) WHERE pesquisa_id IS NOT NULL;