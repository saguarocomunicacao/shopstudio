ALTER TABLE public.profile_video_settings ALTER COLUMN veo_model SET DEFAULT 'veo-3.1-fast-generate-preview';
UPDATE public.profile_video_settings SET veo_model = 'veo-3.1-fast-generate-preview' WHERE veo_model = 'veo-3.1-fast-generate-001';
UPDATE public.profile_video_settings SET veo_model = 'veo-3.1-generate-preview' WHERE veo_model = 'veo-3.1-generate-001';