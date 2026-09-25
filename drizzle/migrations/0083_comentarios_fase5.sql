CREATE TABLE public.video_comentarios_coletas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  url text NOT NULL,
  titulo text,
  origem text,
  qtd integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'coletando' CHECK (status IN ('coletando','processando','classificando','ok','sem_comentarios','erro')),
  run_id text,
  iniciado_em timestamptz,
  erro text,
  custo_usd numeric NOT NULL DEFAULT 0,
  n_comentarios integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, tiktok_video_id)
);
CREATE INDEX video_comentarios_coletas_status_idx ON public.video_comentarios_coletas(status, iniciado_em);
GRANT SELECT ON public.video_comentarios_coletas TO authenticated;
GRANT ALL ON public.video_comentarios_coletas TO service_role;
ALTER TABLE public.video_comentarios_coletas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver coletas comentarios" ON public.video_comentarios_coletas FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.video_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coleta_id uuid NOT NULL REFERENCES public.video_comentarios_coletas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  cid text NOT NULL,
  texto text NOT NULL,
  likes integer NOT NULL DEFAULT 0,
  data timestamptz,
  autor text,
  respostas integer NOT NULL DEFAULT 0,
  fixado boolean NOT NULL DEFAULT false,
  curtido_dono boolean NOT NULL DEFAULT false,
  categoria text,
  subtipo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coleta_id, cid)
);
GRANT SELECT ON public.video_comentarios TO authenticated;
GRANT ALL ON public.video_comentarios TO service_role;
ALTER TABLE public.video_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver comentarios" ON public.video_comentarios FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

CREATE TABLE public.video_comentarios_insights (
  coleta_id uuid PRIMARY KEY REFERENCES public.video_comentarios_coletas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  insights jsonb NOT NULL,
  modelo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.video_comentarios_insights TO authenticated;
GRANT ALL ON public.video_comentarios_insights TO service_role;
ALTER TABLE public.video_comentarios_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver insights comentarios" ON public.video_comentarios_insights FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));

ALTER TABLE public.jobs ADD COLUMN contexto_compradores text;
ALTER TABLE public.profiles ADD COLUMN ler_comentarios_campeoes boolean NOT NULL DEFAULT false;