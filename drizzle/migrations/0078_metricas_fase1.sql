ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS tiktok_video_url text, ADD COLUMN IF NOT EXISTS tiktok_video_id text;
CREATE INDEX IF NOT EXISTS jobs_tiktok_video_id_idx ON public.jobs (profile_id, tiktok_video_id) WHERE tiktok_video_id IS NOT NULL;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_formato_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_formato_check CHECK (formato = ANY (ARRAY['completo'::text, 'gravacao'::text, 'externo'::text]));

CREATE TABLE public.perfil_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data date NOT NULL,
  seguidores bigint, seguindo bigint, curtidas_total bigint, videos_total bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, data)
);
GRANT SELECT ON public.perfil_metricas TO authenticated;
GRANT ALL ON public.perfil_metricas TO service_role;
ALTER TABLE public.perfil_metricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver metricas do perfil" ON public.perfil_metricas FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.video_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  data date NOT NULL,
  views bigint, likes bigint, comentarios bigint, compartilhamentos bigint, salvos bigint, reposts bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, tiktok_video_id, data)
);
CREATE INDEX video_metricas_job_idx ON public.video_metricas (job_id, data);
GRANT SELECT ON public.video_metricas TO authenticated;
GRANT ALL ON public.video_metricas TO service_role;
ALTER TABLE public.video_metricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver metricas de video" ON public.video_metricas FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.videos_nao_vinculados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  url text NOT NULL,
  legenda text,
  capa_url text,
  publicado_em timestamptz,
  duracao numeric,
  vinculado_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  visto_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, tiktok_video_id)
);
GRANT SELECT ON public.videos_nao_vinculados TO authenticated;
GRANT ALL ON public.videos_nao_vinculados TO service_role;
ALTER TABLE public.videos_nao_vinculados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver videos nao vinculados" ON public.videos_nao_vinculados FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.metricas_coleta (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'nunca',
  run_id text,
  iniciado_em timestamptz,
  ultima_coleta_em timestamptz,
  ultimo_manual_em timestamptz,
  ultimo_erro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.metricas_coleta TO authenticated;
GRANT ALL ON public.metricas_coleta TO service_role;
ALTER TABLE public.metricas_coleta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver coleta do perfil" ON public.metricas_coleta FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND (private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar') OR private.has_permission(auth.uid(), profile_id, 'perfis', 'visualizar')));