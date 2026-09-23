ALTER TABLE public.profile_video_settings
ADD COLUMN visual_style text NOT NULL DEFAULT 'realista',
ADD COLUMN visual_style_custom text;

ALTER TABLE public.profile_video_settings
ADD CONSTRAINT profile_video_settings_visual_style_check
CHECK (visual_style IN ('realista', 'cartoon', '3d', 'aquarela', 'anime', 'personalizado'));

ALTER TABLE public.profile_video_settings
ADD CONSTRAINT profile_video_settings_visual_style_custom_check
CHECK (visual_style_custom IS NULL OR char_length(visual_style_custom) <= 500);

ALTER TABLE public.jobs
ADD COLUMN visual_style_override text,
ADD COLUMN visual_style_custom text;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_visual_style_override_check
CHECK (visual_style_override IS NULL OR visual_style_override IN ('realista', 'cartoon', '3d', 'aquarela', 'anime', 'personalizado'));

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_visual_style_custom_check
CHECK (visual_style_custom IS NULL OR char_length(visual_style_custom) <= 500);