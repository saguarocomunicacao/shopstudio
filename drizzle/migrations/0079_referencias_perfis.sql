CREATE TABLE public.referencia_perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle text NOT NULL,
  meu_perfil_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome text,
  foto_path text,
  qtd_videos integer NOT NULL DEFAULT 50,
  acompanhar boolean NOT NULL DEFAULT true,
  fonte_roteirista boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'nunca',
  run_id text,
  iniciado_em timestamptz,
  ultima_coleta_em timestamptz,
  ultimo_manual_em timestamptz,
  ultimo_erro text,
  insights text,
  insights_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, handle)
);
GRANT SELECT ON public.referencia_perfis TO authenticated;
GRANT ALL ON public.referencia_perfis TO service_role;
ALTER TABLE public.referencia_perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver referencias" ON public.referencia_perfis FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.referencia_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referencia_id uuid NOT NULL REFERENCES public.referencia_perfis(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  url text NOT NULL,
  legenda text,
  publicado_em timestamptz,
  duracao numeric,
  capa_path text,
  analise_id uuid REFERENCES public.video_analises(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referencia_id, tiktok_video_id)
);
GRANT SELECT ON public.referencia_videos TO authenticated;
GRANT ALL ON public.referencia_videos TO service_role;
ALTER TABLE public.referencia_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver videos de referencia" ON public.referencia_videos FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.referencia_perfil_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referencia_id uuid NOT NULL REFERENCES public.referencia_perfis(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data date NOT NULL,
  seguidores bigint, seguindo bigint, curtidas_total bigint, videos_total bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referencia_id, data)
);
GRANT SELECT ON public.referencia_perfil_metricas TO authenticated;
GRANT ALL ON public.referencia_perfil_metricas TO service_role;
ALTER TABLE public.referencia_perfil_metricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver metricas de referencia" ON public.referencia_perfil_metricas FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.referencia_video_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referencia_id uuid NOT NULL REFERENCES public.referencia_perfis(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  data date NOT NULL,
  views bigint, likes bigint, comentarios bigint, compartilhamentos bigint, salvos bigint, reposts bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referencia_id, tiktok_video_id, data)
);
GRANT SELECT ON public.referencia_video_metricas TO authenticated;
GRANT ALL ON public.referencia_video_metricas TO service_role;
ALTER TABLE public.referencia_video_metricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver metricas de video de referencia" ON public.referencia_video_metricas FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

ALTER TABLE public.video_analises ADD COLUMN IF NOT EXISTS referencia_id uuid REFERENCES public.referencia_perfis(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS video_analises_fila_idx ON public.video_analises (status, created_at) WHERE status = 'na_fila';

INSERT INTO public.prompt_templates (key, title, description, body, placeholders, sort_order)
VALUES ('insights_referencia', 'Insights de perfil de referência',
 'Cruza as análises dos vídeos de um @ com as métricas e gera padrões, ganchos e recomendações.',
 E'Você é um estrategista de conteúdo de TikTok Shop. Abaixo estão os vídeos analisados do perfil @{handle}, cada um com o que foi identificado (gancho, formato, tom, duração, ritmo, pessoa/mão, produto e segundo em que aparece, texto na tela, CTA) e suas métricas (views, likes, comentários, compartilhamentos, salvos, engajamento %).\nMediana de views: {mediana_views}.\nMeu perfil: {meu_perfil} (nicho: {nicho}).\n\nResponda em português do Brasil, em Markdown, com exatamente estas seções:\n## Padrões: acima vs abaixo da mediana\n(gancho, formato, duração, ritmo, presença de produto nos 2s iniciais)\n## 5 ganchos que mais funcionaram\n(cite o vídeo e as views, copiando os números dos dados)\n## Recomendações para o meu perfil\n(3 a 5 frases de ação concretas)\n## O que muda entre os 5 melhores e os 5 piores\n(tabela Markdown com colunas: Aspecto | 5 melhores | 5 piores)\n\nNunca invente números: use apenas os valores dos dados.\n\nDADOS:\n{dados}',
 ARRAY['handle','mediana_views','meu_perfil','nicho','dados'], 70)
ON CONFLICT (key) DO NOTHING;