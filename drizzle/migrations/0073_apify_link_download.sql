ALTER TABLE public.tenant_api_keys DROP CONSTRAINT tenant_api_keys_provider_check;
ALTER TABLE public.tenant_api_keys ADD CONSTRAINT tenant_api_keys_provider_check
  CHECK (provider = ANY (ARRAY['gemini','json2video','elevenlabs','kalodata','apify']));

ALTER TABLE public.video_analises DROP CONSTRAINT video_analises_origem_check;
ALTER TABLE public.video_analises ADD CONSTRAINT video_analises_origem_check
  CHECK (origem = ANY (ARRAY['arquivo','youtube','tiktok','instagram']));
ALTER TABLE public.video_analises DROP CONSTRAINT video_analises_status_check;
ALTER TABLE public.video_analises ADD CONSTRAINT video_analises_status_check
  CHECK (status = ANY (ARRAY['enviando','baixando','analisando','pronto','erro']));

ALTER TABLE public.video_analises
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS apify_run_id text,
  ADD COLUMN IF NOT EXISTS download_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS so_download boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rede_meta jsonb;

UPDATE public.video_analises SET link_url = youtube_url WHERE link_url IS NULL AND youtube_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS video_analises_baixando_idx ON public.video_analises (status) WHERE status = 'baixando';

INSERT INTO public.tarifas (tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo) VALUES
  ('usd_real','apify:tiktok',1,'USD','2026-01-01',true),
  ('usd_real','apify:youtube',1,'USD','2026-01-01',true),
  ('usd_real','apify:instagram',1,'USD','2026-01-01',true);

INSERT INTO public.app_config (key, value_text) VALUES
  ('apify_actor_tiktok','clockworks/tiktok-scraper'),
  ('apify_actor_youtube','streamers/youtube-video-downloader'),
  ('apify_actor_instagram','apify/instagram-reel-scraper')
ON CONFLICT (key) DO NOTHING;