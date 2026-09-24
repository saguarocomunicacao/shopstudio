CREATE TABLE public.radar_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referencia_id uuid NOT NULL REFERENCES public.referencia_perfis(id) ON DELETE CASCADE,
  tiktok_video_id text NOT NULL,
  detectado_em timestamptz NOT NULL DEFAULT now(),
  views bigint NOT NULL DEFAULT 0,
  engajamento_pct numeric,
  razao numeric,
  razao_texto text NOT NULL DEFAULT '',
  em_alta_nicho boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','visto','usado','ignorado')),
  analise_id uuid REFERENCES public.video_analises(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referencia_id, tiktok_video_id)
);
CREATE INDEX radar_alertas_perfil_idx ON public.radar_alertas(profile_id, detectado_em DESC);
GRANT SELECT ON public.radar_alertas TO authenticated;
GRANT ALL ON public.radar_alertas TO service_role;
ALTER TABLE public.radar_alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver radar" ON public.radar_alertas FOR SELECT TO authenticated
  USING (private.tenant_ok(tenant_id) AND private.has_permission(auth.uid(), profile_id, 'metricas', 'visualizar'));