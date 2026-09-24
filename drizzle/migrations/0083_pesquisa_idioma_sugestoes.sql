ALTER TABLE public.pesquisas_tiktok_videos ADD COLUMN IF NOT EXISTS idioma text;
ALTER TABLE public.pesquisas_tiktok ADD COLUMN IF NOT EXISTS sugestoes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.pesquisas_tiktok ADD COLUMN IF NOT EXISTS termo_idioma text;