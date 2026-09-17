ALTER TABLE public.profile_video_settings
  ADD COLUMN IF NOT EXISTS avatar_reference_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.profile_video_settings
   SET avatar_reference_urls = jsonb_build_array(avatar_reference_url)
 WHERE avatar_reference_url IS NOT NULL
   AND avatar_reference_urls = '[]'::jsonb;